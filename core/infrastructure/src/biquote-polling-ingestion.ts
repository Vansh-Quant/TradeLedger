import type { InstrumentId, MarketDataSink } from "@tradeledger/domain";
import { BIQUOTE_NATIVE_INTERVALS, type BiQuoteInterval, type BiQuoteMarketDataProvider } from "./biquote-market-data-provider.js";

/**
 * Polling ingestion for the BiQuote REST provider.
 *
 * The REST adapter has no streaming subscription (see
 * `BiQuoteMarketDataProvider.subscribe`), and the vendor's SignalR tick hub
 * could not be verified working (negotiation and handshake succeed but every
 * invocation closes the connection), so live state is maintained through the
 * verified polling mechanism instead: closed 1-minute candles plus the quote
 * endpoint, which reports "no tick data" (HTTP 404) for some symbols.
 *
 * Nothing is ever fabricated: symbols without quote data simply never receive
 * a Quote point, and instruments without recent candles stay as they are.
 */
export interface MarketDataPollingStatus {
  readonly providerId: string;
  readonly polling: boolean;
  readonly instruments: readonly string[];
  readonly barInterval: string;
  readonly barPollIntervalMs: number;
  readonly quotePollIntervalMs: number;
  readonly lastPollAt?: string;
  readonly lastAcceptedAt?: string;
  readonly lastErrorAt?: string;
  readonly lastError?: string;
  readonly acceptedPoints: number;
  readonly skippedPoints: number;
  /** Instruments whose quote endpoint currently reports no tick data. */
  readonly quoteUnavailable: readonly string[];
}

export interface BiQuotePollingOptions {
  readonly provider: BiQuoteMarketDataProvider;
  readonly sink: MarketDataSink;
  readonly instruments: readonly InstrumentId[];
  readonly barInterval?: BiQuoteInterval;
  readonly barPollIntervalMs?: number;
  readonly quotePollIntervalMs?: number;
  /** Backoff applied to symbols the quote endpoint reports as having no ticks. */
  readonly noQuoteBackoffMs?: number;
  readonly now?: () => number;
}

const DEFAULT_BAR_INTERVAL: BiQuoteInterval = "1m";
const DEFAULT_BAR_POLL_MS = 30_000;
const DEFAULT_QUOTE_POLL_MS = 30_000;
const DEFAULT_NO_QUOTE_BACKOFF_MS = 10 * 60_000;

export class BiQuotePollingIngestion {
  private readonly provider: BiQuoteMarketDataProvider;
  private readonly sink: MarketDataSink;
  private readonly instruments: readonly InstrumentId[];
  private readonly barInterval: BiQuoteInterval;
  private readonly barPollIntervalMs: number;
  private readonly quotePollIntervalMs: number;
  private readonly noQuoteBackoffMs: number;
  private readonly now: () => number;

  private readonly lastObserved = new Map<InstrumentId, number>();
  private readonly nextQuoteAt = new Map<InstrumentId, number>();
  private readonly quoteUnavailable = new Set<InstrumentId>();

  private barTimer: NodeJS.Timeout | undefined;
  private quoteTimer: NodeJS.Timeout | undefined;
  private running = false;
  private inFlight = false;
  private accepted = 0;
  private skipped = 0;
  private lastPollAt: string | undefined;
  private lastAcceptedAt: string | undefined;
  private lastError: string | undefined;
  private lastErrorAt: string | undefined;

  constructor(options: BiQuotePollingOptions) {
    if (options.instruments.length === 0) throw new Error("polling ingestion requires at least one instrument");
    this.provider = options.provider;
    this.sink = options.sink;
    this.instruments = Object.freeze([...options.instruments]);
    this.barInterval = options.barInterval ?? DEFAULT_BAR_INTERVAL;
    if (!(BIQUOTE_NATIVE_INTERVALS as readonly string[]).includes(this.barInterval)) {
      throw new Error(`polling bar interval "${this.barInterval}" is not a native provider interval`);
    }
    this.barPollIntervalMs = options.barPollIntervalMs ?? DEFAULT_BAR_POLL_MS;
    this.quotePollIntervalMs = options.quotePollIntervalMs ?? DEFAULT_QUOTE_POLL_MS;
    this.noQuoteBackoffMs = options.noQuoteBackoffMs ?? DEFAULT_NO_QUOTE_BACKOFF_MS;
    this.now = options.now ?? Date.now;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.pollNow();
    // The interval callbacks poll bars and quotes independently, so each one
    // stamps the cycle timestamp; otherwise `lastPollAt` would stay frozen at
    // the initial pollNow() even though polling continues.
    this.barTimer = setInterval(() => void this.runIntervalPoll(() => this.pollBars()), this.barPollIntervalMs);
    this.quoteTimer = setInterval(() => void this.runIntervalPoll(() => this.pollQuotes()), this.quotePollIntervalMs);
    this.barTimer.unref?.();
    this.quoteTimer.unref?.();
  }

  private async runIntervalPoll(task: () => Promise<void>): Promise<void> {
    try {
      await task();
    } finally {
      this.lastPollAt = new Date(this.now()).toISOString();
    }
  }

  stop(): void {
    this.running = false;
    if (this.barTimer !== undefined) clearInterval(this.barTimer);
    if (this.quoteTimer !== undefined) clearInterval(this.quoteTimer);
    this.barTimer = undefined;
    this.quoteTimer = undefined;
  }

  status(): MarketDataPollingStatus {
    return Object.freeze({
      providerId: this.provider.providerId,
      polling: this.running,
      instruments: this.instruments,
      barInterval: this.barInterval,
      barPollIntervalMs: this.barPollIntervalMs,
      quotePollIntervalMs: this.quotePollIntervalMs,
      ...(this.lastPollAt === undefined ? {} : { lastPollAt: this.lastPollAt }),
      ...(this.lastAcceptedAt === undefined ? {} : { lastAcceptedAt: this.lastAcceptedAt }),
      ...(this.lastErrorAt === undefined ? {} : { lastErrorAt: this.lastErrorAt }),
      ...(this.lastError === undefined ? {} : { lastError: this.lastError }),
      acceptedPoints: this.accepted,
      skippedPoints: this.skipped,
      quoteUnavailable: Object.freeze([...this.quoteUnavailable]),
    });
  }

  /** Runs one full bar + quote cycle. Used by start() and by tests. */
  async pollNow(): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      await this.pollBars();
      await this.pollQuotes();
      this.lastPollAt = new Date(this.now()).toISOString();
    } finally {
      this.inFlight = false;
    }
  }

  async pollBars(): Promise<void> {
    // Look back over a few candle periods so a fresh process sees a valid bar.
    const windowMs = Math.max(this.barPollIntervalMs, barSeconds(this.barInterval) * 1000 * 3);
    for (const instrument of this.instruments) {
      try {
        const nowMs = this.now();
        const bars = await this.provider.historicalWithInterval(
          instrument, "bar", this.barInterval,
          new Date(nowMs - windowMs).toISOString(), new Date(nowMs).toISOString(),
        );
        const newest = bars.length > 0 ? bars[bars.length - 1] : undefined;
        if (newest === undefined || newest.kind !== "bar") continue;
        this.acceptPoint(instrument, newest, Date.parse(newest.endAt));
      } catch (error) {
        this.recordError(error);
      }
    }
  }

  async pollQuotes(): Promise<void> {
    const nowMs = this.now();
    for (const instrument of this.instruments) {
      const nextAt = this.nextQuoteAt.get(instrument);
      if (nextAt !== undefined && nowMs < nextAt) continue;
      try {
        const quote = await this.provider.quote(instrument);
        if (quote === undefined) {
          // Venue reports no tick data for this symbol: back off instead of hammering it.
          this.quoteUnavailable.add(instrument);
          this.nextQuoteAt.set(instrument, nowMs + this.noQuoteBackoffMs);
          continue;
        }
        this.quoteUnavailable.delete(instrument);
        this.nextQuoteAt.set(instrument, nowMs + this.quotePollIntervalMs);
        this.acceptPoint(instrument, quote, Date.parse(quote.observedAt));
      } catch (error) {
        this.recordError(error);
        this.nextQuoteAt.set(instrument, nowMs + this.quotePollIntervalMs);
      }
    }
  }

  /**
   * Accepts a point only when it advances the instrument's observation
   * timeline. The state store rejects older observations by contract, so
   * interleaving (a quote arriving between two candle polls) must skip stale
   * points rather than fail the poll.
   */
  private acceptPoint(instrument: InstrumentId, data: Parameters<MarketDataSink["accept"]>[0], observedMs: number): void {
    if (!Number.isFinite(observedMs)) {
      this.recordError(new Error(`received a point without a valid timestamp for ${instrument}`));
      return;
    }
    const previous = this.lastObserved.get(instrument);
    if (previous !== undefined && observedMs <= previous) {
      this.skipped += 1;
      return;
    }
    try {
      void this.sink.accept(data);
      this.lastObserved.set(instrument, observedMs);
      this.accepted += 1;
      this.lastAcceptedAt = new Date(this.now()).toISOString();
      this.lastError = undefined;
      this.lastErrorAt = undefined;
    } catch (error) {
      this.recordError(error);
    }
  }

  private recordError(error: unknown): void {
    this.lastError = error instanceof Error ? error.message : String(error);
    this.lastErrorAt = new Date(this.now()).toISOString();
  }
}

function barSeconds(interval: BiQuoteInterval): number {
  switch (interval) {
    case "1m": return 60;
    case "5m": return 300;
    case "15m": return 900;
    case "30m": return 1800;
    case "1h": return 3600;
    case "4h": return 14400;
    case "1d": return 86_400;
  }
}