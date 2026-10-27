import { describe, expect, it, vi } from "vitest";
import { BiQuoteMarketDataProvider } from "../../core/infrastructure/src/biquote-market-data-provider.js";
import { BiQuotePollingIngestion } from "../../core/infrastructure/src/biquote-polling-ingestion.js";
import { InMemoryMarketDataStateStore, MarketDataStateStoreSink } from "../../core/infrastructure/src/index.js";
import type { InstrumentId } from "../../core/domain/src/index.js";

const XAUUSD = "XAUUSD" as InstrumentId;
const NOW = Date.parse("2026-10-25T12:00:00.000Z");

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

interface Fixture {
  readonly fetcher: ReturnType<typeof vi.fn>;
  readonly store: InMemoryMarketDataStateStore;
  readonly ingestion: BiQuotePollingIngestion;
}

function makeFixture(options: {
  quote?: Record<string, unknown> | "none";
  breakBars?: boolean;
  quoteObservedAt?: string;
} = {}): Fixture {
  const store = new InMemoryMarketDataStateStore();
  const sink = new MarketDataStateStoreSink(store);
  const openTime = new Date(NOW - 120_000).toISOString();
  const quoteObservedAt = options.quoteObservedAt ?? new Date(NOW).toISOString();

  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/ohlc")) {
      if (options.breakBars) throw new Error("provider unreachable");
      const interval = url.searchParams.get("interval") ?? "1m";
      return json({
        symbol: "XAUUSD", interval,
        bars: [{
          openTime, open: 3990, high: 4005, low: 3985, close: 4000,
          volume: 0, tickVolume: 1234, isOpen: false,
        }],
      });
    }
    if (options.quote === "none") return json({ message: "No tick data available for 'XAUUSD'" }, 404);
    if (options.quote !== undefined) return json({ ...options.quote, timestamp: quoteObservedAt });
    return json({ message: "no quote configured" }, 404);
  });

  const provider = new BiQuoteMarketDataProvider({ fetcher: fetcher as unknown as typeof fetch });
  const ingestion = new BiQuotePollingIngestion({
    provider,
    sink: { accept: (point) => { sink.accept(point); } },
    instruments: [XAUUSD],
    now: () => NOW,
  });
  return { fetcher, store, ingestion };
}

describe("BiQuote polling ingestion", () => {
  it("ingests the newest closed candle into the market-data state store", async () => {
    const { ingestion, store } = makeFixture();
    await ingestion.pollNow();

    const state = store.get(XAUUSD);
    expect(state).toBeDefined();
    expect(state?.latestBar).toMatchObject({ close: 4000, timeframeSeconds: 60, source: "biquote" });
    expect(state?.lastObservedAt).toBe(new Date(NOW - 60_000).toISOString());

    const status = ingestion.status();
    expect(status.acceptedPoints).toBeGreaterThanOrEqual(1);
    expect(status.lastPollAt).toBe(new Date(NOW).toISOString());
    expect(status.lastError).toBeUndefined();
    expect(status.quoteUnavailable).toContain("XAUUSD");
  });

  it("ingests a real quote without inventing depth sizes", async () => {
    const { ingestion, store } = makeFixture({
      quote: { symbol: "XAUUSD", bid: 3999.5, ask: 4000.5, last: 0, volume: 0, source: "venue" },
    });
    await ingestion.pollNow();

    const quote = store.get(XAUUSD)?.latestQuote;
    expect(quote).toMatchObject({ bid: 3999.5, ask: 4000.5, source: "venue" });
    expect(quote).not.toHaveProperty("bidSize");
    expect(quote).not.toHaveProperty("askSize");
    expect(ingestion.status().quoteUnavailable).not.toContain("XAUUSD");
  });

  it("skips unchanged candles and stale observations instead of failing", async () => {
    const { ingestion, fetcher } = makeFixture({ quote: "none" });
    await ingestion.pollNow();
    const callsAfterFirst = fetcher.mock.calls.length;
    await ingestion.pollNow();

    const status = ingestion.status();
    expect(status.acceptedPoints).toBe(1);
    expect(status.skippedPoints).toBeGreaterThanOrEqual(1);
    expect(status.lastError).toBeUndefined();
    expect(fetcher.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it("never accepts an observation older than the current state", async () => {
    const { ingestion, store } = makeFixture({
      quote: { symbol: "XAUUSD", bid: 1, ask: 2 },
      // Quote timestamp predates the candle end already accepted.
      quoteObservedAt: new Date(NOW - 600_000).toISOString(),
    });
    await ingestion.pollNow();
    expect(ingestion.status().lastError).toBeUndefined();
    expect(store.get(XAUUSD)?.latestQuote).toBeUndefined();
    expect(ingestion.status().skippedPoints).toBeGreaterThanOrEqual(1);
  });

  it("records provider failures without fabricating any data", async () => {
    const { ingestion, store } = makeFixture({ breakBars: true, quote: "none" });
    await ingestion.pollNow();

    expect(store.get(XAUUSD)).toBeUndefined();
    const status = ingestion.status();
    expect(status.lastError).toContain("provider unreachable");
    expect(status.lastErrorAt).toBeDefined();
    expect(status.acceptedPoints).toBe(0);
  });

  it("backs off symbols whose quotes the venue reports as unavailable", async () => {
    const { ingestion, fetcher } = makeFixture({ quote: "none" });
    await ingestion.pollNow();
    const quoteCalls = () => fetcher.mock.calls.filter(([input]) => String(input).includes("allowStale")).length;
    const afterFirst = quoteCalls();
    await ingestion.pollNow();

    expect(quoteCalls()).toBe(afterFirst); // no repeated hammering within the backoff
    expect(ingestion.status().quoteUnavailable).toEqual(["XAUUSD"]);
  });

  it("starts and stops polling through the lifecycle", async () => {
    const { ingestion } = makeFixture({ quote: "none" });
    ingestion.start();
    expect(ingestion.status().polling).toBe(true);
    for (let i = 0; i < 20 && ingestion.status().acceptedPoints === 0; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(ingestion.status().acceptedPoints).toBeGreaterThanOrEqual(1);
    ingestion.stop();
    expect(ingestion.status().polling).toBe(false);
  });

  it("keeps lastPollAt advancing on the interval-driven poll path", async () => {
    const store = new InMemoryMarketDataStateStore();
    const sink = new MarketDataStateStoreSink(store);
    const openTime = new Date(NOW - 120_000).toISOString();
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/ohlc")) {
        return json({
          symbol: "XAUUSD", interval: "1m",
          bars: [{ openTime, open: 3990, high: 4005, low: 3985, close: 4000, volume: 0, tickVolume: 1, isOpen: false }],
        });
      }
      return json({ message: "no tick data" }, 404);
    });
    const provider = new BiQuoteMarketDataProvider({ fetcher: fetcher as unknown as typeof fetch });
    let clockMs = NOW;
    const ingestion = new BiQuotePollingIngestion({
      provider,
      sink: { accept: (point) => { sink.accept(point); } },
      instruments: [XAUUSD],
      barPollIntervalMs: 5,
      quotePollIntervalMs: 5,
      now: () => clockMs,
    });
    const pollAt = (): string | undefined => ingestion.status().lastPollAt;
    ingestion.start();
    try {
      for (let i = 0; i < 100 && pollAt() === undefined; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      const first = pollAt();
      expect(first).toBeDefined();

      // Interval timers poll bars/quotes directly (not through pollNow), so the
      // cycle timestamp must still advance or the status would report a stale
      // last poll while data keeps arriving.
      clockMs = NOW + 60_000;
      for (let i = 0; i < 120 && pollAt() === first; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      expect(pollAt()).toBe(new Date(NOW + 60_000).toISOString());
    } finally {
      ingestion.stop();
    }
  });

  it("rejects invalid configuration", () => {
    const provider = new BiQuoteMarketDataProvider({ fetcher: vi.fn() as unknown as typeof fetch });
    const sink = { accept: () => {} };
    expect(() => new BiQuotePollingIngestion({ provider, sink, instruments: [] })).toThrow("at least one instrument");
    expect(() => new BiQuotePollingIngestion({ provider, sink, instruments: [XAUUSD], barInterval: "1w" as never })).toThrow("not a native provider interval");
  });
});