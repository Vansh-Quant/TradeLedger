import { describe, expect, it, vi } from "vitest";
import { BiQuoteMarketDataProvider } from "../../core/infrastructure/src/biquote-market-data-provider.js";
import type { InstrumentId } from "../../core/domain/src/index.js";

const XAUUSD = "XAUUSD" as InstrumentId;
const START = "2026-10-01T00:00:00.000Z";
const END = "2026-10-02T00:00:00.000Z";
function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function candle(overrides: Record<string, unknown> = {}) {
  return { openTime: "2026-10-01T00:00:00Z", open: 3800, high: 3820, low: 3790,
    close: 3810, volume: 0, tickVolume: 124, isOpen: false, ...overrides };
}
function envelope(bars: unknown[]) { return { symbol: "XAUUSD", interval: "1h", bars }; }

describe("BiQuoteMarketDataProvider", () => {
  it("maps closed candles, sorts them, and preserves zero traded volume", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL) => response(envelope([
      candle({ openTime: "2026-10-01T01:00:00Z" }),
      candle({ openTime: "2026-10-01T00:00:00Z", close: 3805 }),
      candle({ openTime: "2026-10-01T02:00:00Z", isOpen: true }),
    ])));
    const provider = new BiQuoteMarketDataProvider({ fetcher });
    const bars = await provider.historical(XAUUSD, "bar", START, END);
    expect(bars).toHaveLength(2);
    expect(bars.map((bar) => "startAt" in bar ? bar.startAt : undefined)).toEqual(["2026-10-01T00:00:00.000Z", "2026-10-01T01:00:00.000Z"]);
    expect(bars[0]).toMatchObject({ instrumentId: XAUUSD, timeframeSeconds: 3600, volume: 0, source: "biquote", close: 3805 });
    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/api/XAUUSD/ohlc");
    expect(url.searchParams.get("from")).toBe(START);
    expect(url.searchParams.get("to")).toBe(END);
  });
  it.each(["EURUSD", "XAUUSD", "USDJPY"] as const)("requests historical bars for %s without changing its instrument identity", async (symbol) => {
    const instrument = symbol as InstrumentId;
    const fetcher = vi.fn(async (_input: RequestInfo | URL) => response({
      symbol, interval: "1h", bars: [candle()],
    }));
    const provider = new BiQuoteMarketDataProvider({ fetcher });
    const bars = await provider.historical(instrument, "bar", START, END);

    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({ instrumentId: instrument, source: "biquote", timeframeSeconds: 3600 });
    expect(new URL(String(fetcher.mock.calls[0]?.[0])).pathname).toBe(`/api/${symbol}/ohlc`);
  });
  it("rejects unsupported kinds and invalid date ranges", async () => {
    const p = new BiQuoteMarketDataProvider({ fetcher: vi.fn(async () => response({})) });
    await expect(p.historical(XAUUSD, "quote", START, END)).rejects.toThrow('does not support kind "quote"');
    await expect(p.historical(XAUUSD, "bar", END, START)).rejects.toThrow("endAt after startAt");
  });
  it("rejects HTTP errors instead of fabricating fallback data", async () => {
    const p = new BiQuoteMarketDataProvider({ fetcher: vi.fn(async () => response({}, 503)) });
    await expect(p.historical(XAUUSD, "bar", START, END)).rejects.toThrow("HTTP 503");
  });
  it("rejects mismatched symbols and malformed OHLC", async () => {
    const wrong = new BiQuoteMarketDataProvider({ fetcher: vi.fn(async () => response({ symbol: "EURUSD", interval: "1h", bars: [candle()] })) });
    await expect(wrong.historical(XAUUSD, "bar", START, END)).rejects.toThrow("mismatched symbol/interval");
    const bad = new BiQuoteMarketDataProvider({ fetcher: vi.fn(async () => response(envelope([candle({ high: 1, open: 10 })]))) });
    await expect(bad.historical(XAUUSD, "bar", START, END)).rejects.toThrow("high must be greater than or equal to open and close");
  });
  it("rejects duplicate timestamps", async () => {
    const p = new BiQuoteMarketDataProvider({ fetcher: vi.fn(async () => response(envelope([candle(), candle({ close: 3805 })]))) });
    await expect(p.historical(XAUUSD, "bar", START, END)).rejects.toThrow("duplicate candles");
  });
  it("reports network errors in health status", async () => {
    const p = new BiQuoteMarketDataProvider({ fetcher: vi.fn(async () => { throw new Error("network unavailable"); }), now: () => START });
    await expect(p.health()).resolves.toMatchObject({ providerId: "biquote", healthy: false, message: "network unavailable" });
  });
  it("does not claim streaming support", async () => {
    const p = new BiQuoteMarketDataProvider({ fetcher: vi.fn(async () => response({})) });
    await expect(p.subscribe({ subscriptionId: "xau", instruments: [XAUUSD], kinds: ["quote"] }, () => {}))
      .rejects.toThrow("does not support streaming subscriptions");
  });
});

describe("BiQuote explicit intervals", () => {
  it("requests the exact interval and derives timeframeSeconds from it", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL) => response({ symbol: "XAUUSD", interval: "5m", bars: [candle({ openTime: "2026-10-01T00:05:00Z" })] }));
    const provider = new BiQuoteMarketDataProvider({ fetcher });
    const bars = await provider.historicalWithInterval(XAUUSD, "bar", "5m", START, END);
    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.searchParams.get("interval")).toBe("5m");
    expect(bars[0]).toMatchObject({ timeframeSeconds: 300, endAt: "2026-10-01T00:10:00.000Z" });
  });

  it("exposes only the intervals the live provider advertises", () => {
    const provider = new BiQuoteMarketDataProvider({ fetcher: vi.fn() });
    expect(provider.supportedIntervals).toEqual(["1m", "5m", "15m", "30m", "1h", "4h", "1d"]);
    expect(provider.capabilities).toMatchObject({ bars: true, historical: true, trades: false });
  });

  it("rejects unsupported intervals client-side before any request", async () => {
    const fetcher = vi.fn(async () => response({}));
    const provider = new BiQuoteMarketDataProvider({ fetcher });
    await expect(provider.historicalWithInterval(XAUUSD, "bar", "1w", START, END))
      .rejects.toThrow("does not support interval \"1w\"; valid intervals: 1m, 5m, 15m, 30m, 1h, 4h, 1d");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("surfaces the provider's own interval rejection message", async () => {
    const fetcher = vi.fn(async () => response({ message: "Invalid interval '1w'", validIntervals: ["15m", "1d", "1h"] }));
    const provider = new BiQuoteMarketDataProvider({ fetcher });
    await expect(provider.historicalWithInterval(XAUUSD, "bar", "1h", START, END))
      .rejects.toThrow("Invalid interval '1w' (valid intervals: 15m, 1d, 1h)");
  });

  it("propagates the provider error message alongside the HTTP status", async () => {
    const fetcher = vi.fn(async () => response({ message: "rate limited" }, 429));
    const provider = new BiQuoteMarketDataProvider({ fetcher });
    await expect(provider.historicalWithInterval(XAUUSD, "bar", "1h", START, END))
      .rejects.toThrow("HTTP 429: rate limited");
  });

  it("returns an empty series for unknown symbols instead of fabricating data", async () => {
    const fetcher = vi.fn(async () => response({ symbol: "ZZZQQQ", interval: "1d", bars: [] }));
    const provider = new BiQuoteMarketDataProvider({ fetcher });
    await expect(provider.historicalWithInterval("ZZZQQQ" as InstrumentId, "bar", "1d", START, END))
      .resolves.toEqual([]);
  });

  it("refuses a non-native default interval at construction", () => {
    expect(() => new BiQuoteMarketDataProvider({ interval: "1w" as never })).toThrow("not supported");
  });
});

describe("BiQuote quotes", () => {
  it("parses a real quote without inventing depth sizes", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL) => response({
      symbol: "BTCUSD", bid: 80527.17, ask: 80531.65, last: 0, volume: 0,
      timestamp: "2026-10-25T16:08:32Z", source: "MetaTrader 5 (Broker 1)",
    }));
    const provider = new BiQuoteMarketDataProvider({ fetcher });
    const quote = await provider.quote("BTCUSD" as InstrumentId);
    expect(quote).toMatchObject({
      kind: "quote", instrumentId: "BTCUSD", bid: 80527.17, ask: 80531.65,
      observedAt: "2026-10-25T16:08:32Z", source: "MetaTrader 5 (Broker 1)",
    });
    // The venue publishes no depth: the fields must be absent, not zero.
    expect(quote).not.toHaveProperty("bidSize");
    expect(quote).not.toHaveProperty("askSize");
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("allowStale=false");
  });

  it("reports no quote as undefined for HTTP 404", async () => {
    const fetcher = vi.fn(async () => response({ message: "No tick data available for 'XAUUSD'" }, 404));
    const provider = new BiQuoteMarketDataProvider({ fetcher });
    await expect(provider.quote(XAUUSD)).resolves.toBeUndefined();
  });

  it("rejects malformed or crossed quotes instead of patching them", async () => {
    const crossed = new BiQuoteMarketDataProvider({ fetcher: vi.fn(async () => response({ symbol: "BTCUSD", bid: 10, ask: 9, timestamp: START })) });
    await expect(crossed.quote("BTCUSD" as InstrumentId)).rejects.toThrow("crossed quote");

    const wrongSymbol = new BiQuoteMarketDataProvider({ fetcher: vi.fn(async () => response({ symbol: "EURUSD", bid: 1, ask: 2, timestamp: START })) });
    await expect(wrongSymbol.quote("BTCUSD" as InstrumentId)).rejects.toThrow("malformed quote");

    const noTimestamp = new BiQuoteMarketDataProvider({ fetcher: vi.fn(async () => response({ symbol: "BTCUSD", bid: 1, ask: 2 })) });
    await expect(noTimestamp.quote("BTCUSD" as InstrumentId)).rejects.toThrow("valid timestamp");
  });

  it("reports quote outages with the status and vendor message", async () => {
    const fetcher = vi.fn(async () => response({ message: "upstream unavailable" }, 503));
    const provider = new BiQuoteMarketDataProvider({ fetcher });
    await expect(provider.quote(XAUUSD)).rejects.toThrow("HTTP 503: upstream unavailable");
  });
});
