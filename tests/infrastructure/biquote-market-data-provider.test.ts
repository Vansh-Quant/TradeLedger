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
    expect(bars.map((bar) => bar.startAt)).toEqual(["2026-10-01T00:00:00.000Z", "2026-10-01T01:00:00.000Z"]);
    expect(bars[0]).toMatchObject({ instrumentId: XAUUSD, timeframeSeconds: 3600, volume: 0, source: "biquote", close: 3805 });
    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/api/XAUUSD/ohlc");
    expect(url.searchParams.get("from")).toBe(START);
    expect(url.searchParams.get("to")).toBe(END);
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
