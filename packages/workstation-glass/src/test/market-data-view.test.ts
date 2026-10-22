import { describe, expect, it } from "vitest";
import { describeMarketData, formatAge } from "@/lib/market-data-view";
import type { MarketDataState } from "@/api/types";

const NOW = Date.parse("2026-10-20T12:00:00Z");

function state(overrides: Partial<MarketDataState> = {}): MarketDataState {
  return {
    instrumentId: "AAPL",
    latestQuote: {
      kind: "quote",
      instrumentId: "AAPL",
      bid: 100,
      bidSize: 100,
      ask: 100.25,
      askSize: 100,
      observedAt: "2026-10-20T11:59:50Z",
      source: "vendor",
    },
    lastSequence: 12,
    lastObservedAt: "2026-10-20T11:59:50Z",
    lastReceivedAt: "2026-10-20T11:59:51Z",
    ...overrides,
  };
}

describe("market data view", () => {
  it("reports CONNECTING before the first response", () => {
    const view = describeMarketData({ states: undefined, error: null, now: NOW });
    expect(view.status).toBe("CONNECTING");
    expect(view.rows).toEqual([]);
  });

  it("reports UNAVAILABLE when the read fails before any data", () => {
    const view = describeMarketData({ states: undefined, error: "HTTP 500", now: NOW });
    expect(view.status).toBe("UNAVAILABLE");
  });

  it("reports EMPTY when the backend returns no instruments", () => {
    const view = describeMarketData({ states: [], error: null, now: NOW });
    expect(view.status).toBe("EMPTY");
  });

  it("reports LIVE only for a fresh observation", () => {
    const view = describeMarketData({ states: [state()], error: null, now: NOW });
    expect(view.status).toBe("LIVE");
    expect(view.rows[0]?.ageMs).toBe(10_000);
  });

  it("reports STALE when the observation is old", () => {
    const view = describeMarketData({ states: [state()], error: null, now: NOW + 120_000 });
    expect(view.status).toBe("STALE");
    expect(view.rows[0]?.ageMs).toBe(130_000);
  });

  it("treats a missing timestamp as STALE rather than assuming live", () => {
    const view = describeMarketData({
      states: [state({ latestQuote: undefined, lastObservedAt: "" })],
      error: null,
      now: NOW,
    });
    expect(view.status).toBe("STALE");
    expect(view.rows[0]?.ageMs).toBeNull();
    expect(view.rows[0]?.observedAt).toBeNull();
  });

  it("does not derive a last price from bid and ask", () => {
    const view = describeMarketData({ states: [state()], error: null, now: NOW });
    expect(view.rows[0]?.bid).toBe(100);
    expect(view.rows[0]?.ask).toBe(100.25);
    expect(view.rows[0]?.last).toBeNull();
  });

  it("prefers an executed trade price over a bar close", () => {
    const view = describeMarketData({
      states: [state({
        latestTrade: { kind: "trade", instrumentId: "AAPL", price: 100.1, quantity: 50, observedAt: "2026-10-20T11:59:55Z", source: "vendor" },
        latestBar: {
          kind: "bar", instrumentId: "AAPL", timeframeSeconds: 60,
          startAt: "2026-10-20T11:58:00Z", endAt: "2026-10-20T11:59:00Z",
          open: 99, high: 101, low: 98, close: 100.4, volume: 1000, source: "vendor",
        },
      })],
      error: null,
      now: NOW,
    });
    expect(view.rows[0]?.last).toBe(100.1);
  });

  it("formats ages for display", () => {
    expect(formatAge(5_000)).toBe("5s");
    expect(formatAge(90_000)).toBe("1m");
    expect(formatAge(null)).toBe("unknown");
  });
});
