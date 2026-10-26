import {
  createBar, createProviderHealth, createQuote,
  type InstrumentId, type IntervalHistoricalProvider, type MarketDataKind, type MarketDataPoint,
  type MarketDataProvider, type MarketDataProviderHealth, type MarketDataSubscription, type Quote,
} from "@tradeledger/domain";

/** Intervals the provider serves natively. Verified against the live API. */
export const BIQUOTE_NATIVE_INTERVALS = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"] as const;
export type BiQuoteInterval = (typeof BIQUOTE_NATIVE_INTERVALS)[number];
const INTERVAL_SECONDS: Record<BiQuoteInterval, number> = {
  "1m": 60, "5m": 300, "15m": 900, "30m": 1800, "1h": 3600, "4h": 14400, "1d": 86400,
};
export interface BiQuoteProviderOptions {
  readonly baseUrl?: string; readonly interval?: BiQuoteInterval; readonly limit?: number;
  readonly fetcher?: typeof fetch; readonly now?: () => string; readonly timeoutMs?: number;
}
interface Candle {
  readonly openTime: string; readonly open: number; readonly high: number;
  readonly low: number; readonly close: number; readonly volume: number; readonly isOpen: boolean;
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function numberField(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`BiQuote returned invalid ${field}`);
  return value;
}
function validSymbol(symbol: string): string {
  const normalized = String(symbol).trim().toUpperCase();
  if (!/^[A-Z0-9._-]+$/.test(normalized)) throw new Error("Invalid BiQuote instrument symbol");
  return normalized;
}
function parseCandle(value: unknown): Candle {
  if (!record(value)) throw new Error("BiQuote returned a malformed candle");
  if (typeof value.openTime !== "string" || !Number.isFinite(Date.parse(value.openTime))) {
    throw new Error("BiQuote returned an invalid candle openTime");
  }
  if (typeof value.isOpen !== "boolean") throw new Error("BiQuote candle is missing its isOpen flag");
  const volume = numberField(value.volume, "volume");
  if (volume < 0) throw new Error("BiQuote returned negative volume");
  return {
    openTime: value.openTime, open: numberField(value.open, "open"),
    high: numberField(value.high, "high"), low: numberField(value.low, "low"),
    close: numberField(value.close, "close"), volume, isOpen: value.isOpen,
  };
}

/**
 * Reads the provider's `{ message, validIntervals? }` error body. BiQuote
 * returns these with HTTP 200 for rejected parameters as well as with error
 * statuses, so both paths surface the vendor's own explanation.
 */
function providerMessage(payload: unknown): string | undefined {
  if (!record(payload) || typeof payload.message !== "string") return undefined;
  const valid = Array.isArray(payload.validIntervals)
    ? payload.validIntervals.filter((item): item is string => typeof item === "string")
    : [];
  return valid.length > 0 ? `${payload.message} (valid intervals: ${valid.join(", ")})` : payload.message;
}

export class BiQuoteMarketDataProvider implements MarketDataProvider, IntervalHistoricalProvider {
  readonly providerId = "biquote";
  readonly capabilities = Object.freeze({ quotes: true, trades: false, bars: true, historical: true });
  readonly supportedIntervals: readonly string[] = BIQUOTE_NATIVE_INTERVALS;
  private readonly baseUrl: string;
  private readonly interval: BiQuoteInterval;
  private readonly limit: number;
  private readonly fetcher: typeof fetch;
  private readonly now: () => string;
  private readonly timeoutMs: number;

  constructor(options: BiQuoteProviderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "https://biquote.io").replace(/\/+$/, "");
    this.interval = options.interval ?? "1h";
    this.limit = options.limit ?? 1000;
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? (() => new Date().toISOString());
    this.timeoutMs = options.timeoutMs ?? 15_000;
    if (!Number.isInteger(this.limit) || this.limit < 1 || this.limit > 1000) {
      throw new Error("BiQuote limit must be an integer between 1 and 1000");
    }
    if (!BIQUOTE_NATIVE_INTERVALS.includes(this.interval)) {
      throw new Error(`BiQuote default interval "${this.interval}" is not supported; valid intervals: ${BIQUOTE_NATIVE_INTERVALS.join(", ")}`);
    }
  }

  async subscribe(subscription: MarketDataSubscription, _onData: (data: MarketDataPoint) => void): Promise<void> {
    throw new Error(`BiQuote REST adapter does not support streaming subscriptions (${subscription.subscriptionId}); use historical bars only`);
  }
  async unsubscribe(_subscriptionId: string): Promise<void> {}

  async historical(instrumentId: InstrumentId, kind: MarketDataKind, startAt: string, endAt: string): Promise<readonly MarketDataPoint[]> {
    return this.historicalWithInterval(instrumentId, kind, this.interval, startAt, endAt);
  }

  async historicalWithInterval(
    instrumentId: InstrumentId,
    kind: MarketDataKind,
    interval: string,
    startAt: string,
    endAt: string,
  ): Promise<readonly MarketDataPoint[]> {
    if (kind !== "bar") throw new Error(`BiQuote historical data does not support kind "${kind}"`);
    if (!(BIQUOTE_NATIVE_INTERVALS as readonly string[]).includes(interval)) {
      throw new Error(`BiQuote does not support interval "${interval}"; valid intervals: ${BIQUOTE_NATIVE_INTERVALS.join(", ")}`);
    }
    const seconds = INTERVAL_SECONDS[interval as BiQuoteInterval];
    const startMs = Date.parse(startAt);
    const endMs = Date.parse(endAt);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      throw new Error("BiQuote historical range must contain valid timestamps with endAt after startAt");
    }
    const symbol = validSymbol(String(instrumentId));
    const url = new URL(`${this.baseUrl}/api/${encodeURIComponent(symbol)}/ohlc`);
    url.searchParams.set("interval", interval);
    url.searchParams.set("limit", String(this.limit));
    url.searchParams.set("from", new Date(startMs).toISOString());
    url.searchParams.set("to", new Date(endMs).toISOString());

    let response: Response;
    try {
      response = await this.fetcher(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new Error(`BiQuote OHLC request failed: ${error instanceof Error ? error.message : "network error"}`);
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      if (!response.ok) throw new Error(`BiQuote OHLC request failed with HTTP ${response.status}`);
      throw new Error("BiQuote returned a non-JSON OHLC response");
    }
    if (!response.ok) {
      const detail = providerMessage(payload);
      throw new Error(`BiQuote OHLC request failed with HTTP ${response.status}${detail === undefined ? "" : `: ${detail}`}`);
    }
    if (!Array.isArray((payload as Record<string, unknown>).bars)) {
      const detail = providerMessage(payload);
      if (detail !== undefined) throw new Error(`BiQuote rejected the OHLC request: ${detail}`);
      throw new Error("BiQuote returned an invalid OHLC response or mismatched symbol/interval");
    }
    if (!record(payload) || typeof payload.symbol !== "string" || payload.symbol.toUpperCase() !== symbol ||
      payload.interval !== interval) {
      throw new Error("BiQuote returned an invalid OHLC response or mismatched symbol/interval");
    }
    const bars = (payload.bars as unknown[]).map(parseCandle)
      .filter((candle) => !candle.isOpen)
      .map((candle) => {
        const start = Date.parse(candle.openTime);
        return createBar({
          instrumentId, timeframeSeconds: seconds,
          startAt: new Date(start).toISOString(), endAt: new Date(start + seconds * 1000).toISOString(),
          open: candle.open, high: candle.high, low: candle.low, close: candle.close,
          // FX/CFD volume can be zero. tickVolume is intentionally not substituted.
          volume: candle.volume, source: "biquote",
        });
      })
      .filter((bar) => Date.parse(bar.startAt) >= startMs && Date.parse(bar.startAt) < endMs)
      .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
    for (let i = 1; i < bars.length; i += 1) {
      if (bars[i - 1]?.startAt === bars[i]?.startAt) throw new Error(`BiQuote returned duplicate candles at ${bars[i]?.startAt}`);
    }
    return Object.freeze(bars);
  }

  /**
   * Latest quote for a symbol, or `undefined` when the venue reports no tick
   * data for it (HTTP 404). Bid/ask sizes are never invented: the provider
   * does not publish them, so the returned Quote simply omits them.
   */
  async quote(instrumentId: InstrumentId): Promise<Quote | undefined> {
    const symbol = validSymbol(String(instrumentId));
    const url = `${this.baseUrl}/api/${encodeURIComponent(symbol)}?allowStale=false`;
    let response: Response;
    try {
      response = await this.fetcher(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new Error(`BiQuote quote request failed: ${error instanceof Error ? error.message : "network error"}`);
    }
    if (response.status === 404) return undefined;
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      if (!response.ok) throw new Error(`BiQuote quote request failed with HTTP ${response.status}`);
      throw new Error("BiQuote returned a non-JSON quote response");
    }
    if (!response.ok) {
      const detail = providerMessage(payload);
      throw new Error(`BiQuote quote request failed with HTTP ${response.status}${detail === undefined ? "" : `: ${detail}`}`);
    }
    if (!record(payload) || typeof payload.symbol !== "string" || payload.symbol.toUpperCase() !== symbol) {
      throw new Error("BiQuote returned a malformed quote response");
    }
    const bid = numberField(payload.bid, "quote bid");
    const ask = numberField(payload.ask, "quote ask");
    if (bid > ask) throw new Error("BiQuote returned a crossed quote");
    if (typeof payload.timestamp !== "string" || !Number.isFinite(Date.parse(payload.timestamp))) {
      throw new Error("BiQuote returned a quote without a valid timestamp");
    }
    return createQuote({
      instrumentId, bid, ask, observedAt: payload.timestamp,
      ...(typeof payload.source === "string" && payload.source.trim().length > 0 ? { source: payload.source } : {}),
    });
  }

  async health(): Promise<MarketDataProviderHealth> {
    const checkedAt = this.now();
    try {
      const response = await this.fetcher(`${this.baseUrl}/health`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      return createProviderHealth({
        providerId: this.providerId, healthy: response.ok, checkedAt,
        message: response.ok ? "BiQuote health endpoint reachable" : `BiQuote health endpoint returned HTTP ${response.status}`,
      });
    } catch (error) {
      return createProviderHealth({
        providerId: this.providerId, healthy: false, checkedAt,
        message: error instanceof Error ? error.message : "BiQuote health request failed",
      });
    }
  }
}