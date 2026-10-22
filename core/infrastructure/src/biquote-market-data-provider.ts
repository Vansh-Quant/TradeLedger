import {
  createBar, createProviderHealth,
  type InstrumentId, type MarketDataKind, type MarketDataPoint,
  type MarketDataProvider, type MarketDataProviderHealth, type MarketDataSubscription,
} from "@tradeledger/domain";

export type BiQuoteInterval = "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d";
const INTERVAL_SECONDS: Record<BiQuoteInterval, number> = {
  "1m": 60, "5m": 300, "15m": 900, "30m": 1800, "1h": 3600, "4h": 14400, "1d": 86400,
};
export interface BiQuoteProviderOptions {
  readonly baseUrl?: string; readonly interval?: BiQuoteInterval; readonly limit?: number;
  readonly fetcher?: typeof fetch; readonly now?: () => string;
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

export class BiQuoteMarketDataProvider implements MarketDataProvider {
  readonly providerId = "biquote";
  readonly capabilities = Object.freeze({ quotes: false, trades: false, bars: true, historical: true });
  private readonly baseUrl: string;
  private readonly interval: BiQuoteInterval;
  private readonly limit: number;
  private readonly fetcher: typeof fetch;
  private readonly now: () => string;

  constructor(options: BiQuoteProviderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "https://biquote.io").replace(/\/+$/, "");
    this.interval = options.interval ?? "1h";
    this.limit = options.limit ?? 1000;
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? (() => new Date().toISOString());
    if (!Number.isInteger(this.limit) || this.limit < 1 || this.limit > 1000) {
      throw new Error("BiQuote limit must be an integer between 1 and 1000");
    }
  }

  async subscribe(subscription: MarketDataSubscription, _onData: (data: MarketDataPoint) => void): Promise<void> {
    throw new Error(`BiQuote REST adapter does not support streaming subscriptions (${subscription.subscriptionId}); use historical bars only`);
  }
  async unsubscribe(_subscriptionId: string): Promise<void> {}

  async historical(instrumentId: InstrumentId, kind: MarketDataKind, startAt: string, endAt: string): Promise<readonly MarketDataPoint[]> {
    if (kind !== "bar") throw new Error(`BiQuote historical data does not support kind "${kind}"`);
    const startMs = Date.parse(startAt);
    const endMs = Date.parse(endAt);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      throw new Error("BiQuote historical range must contain valid timestamps with endAt after startAt");
    }
    const symbol = String(instrumentId).trim().toUpperCase();
    if (!/^[A-Z0-9._-]+$/.test(symbol)) throw new Error("Invalid BiQuote instrument symbol");
    const url = new URL(`${this.baseUrl}/api/${encodeURIComponent(symbol)}/ohlc`);
    url.searchParams.set("interval", this.interval);
    url.searchParams.set("limit", String(this.limit));
    url.searchParams.set("from", new Date(startMs).toISOString());
    url.searchParams.set("to", new Date(endMs).toISOString());
    const response = await this.fetcher(url, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`BiQuote OHLC request failed with HTTP ${response.status}`);
    const payload: unknown = await response.json();
    if (!record(payload) || !Array.isArray(payload.bars) ||
      typeof payload.symbol !== "string" || payload.symbol.toUpperCase() !== symbol ||
      payload.interval !== this.interval) {
      throw new Error("BiQuote returned an invalid OHLC response or mismatched symbol/interval");
    }
    const bars = payload.bars.map(parseCandle)
      .filter((candle) => !candle.isOpen)
      .map((candle) => {
        const start = Date.parse(candle.openTime);
        const seconds = INTERVAL_SECONDS[this.interval];
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

  async health(): Promise<MarketDataProviderHealth> {
    const checkedAt = this.now();
    try {
      const response = await this.fetcher(`${this.baseUrl}/health`, { headers: { accept: "application/json" } });
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
