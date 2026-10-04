import { describe, expect, it } from "vitest";
import {
  MarketDataStateBook,
  applyMarketData,
  createMarketDataEnvelope,
  createMarketDataState,
  createQuote,
  isMarketDataStale,
  type InstrumentId,
} from "../../core/domain/src/index.js";

const AAPL = "AAPL" as InstrumentId;

function quote(bid: number, observedAt: string) {
  return createQuote({
    instrumentId: AAPL,
    bid,
    bidSize: 10,
    ask: bid + 0.25,
    askSize: 12,
    observedAt,
  });
}

describe("market data state", () => {
  it("creates an empty state", () => {
    const state = createMarketDataState(AAPL);
    expect(state.instrumentId).toBe(AAPL);
    expect(state.lastSequence).toBe(0);
    expect(state.latestQuote).toBeUndefined();
    expect(Object.isFrozen(state)).toBe(true);
  });

  it("applies a newer envelope", () => {
    const state = createMarketDataState(AAPL);
    const next = applyMarketData(
      state,
      createMarketDataEnvelope(
        1,
        "2026-10-02T10:00:01Z",
        quote(100, "2026-10-02T10:00:00Z"),
      ),
    );

    expect(next.lastSequence).toBe(1);
    expect(next.latestQuote?.bid).toBe(100);
    expect(next.lastObservedAt).toBe("2026-10-02T10:00:00.000Z");
    expect(next.lastReceivedAt).toBe("2026-10-02T10:00:01.000Z");
  });

  it("rejects duplicate or out-of-order sequences", () => {
    const state = applyMarketData(
      createMarketDataState(AAPL),
      createMarketDataEnvelope(
        2,
        "2026-10-02T10:00:02Z",
        quote(100, "2026-10-02T10:00:01Z"),
      ),
    );

    expect(() =>
      applyMarketData(
        state,
        createMarketDataEnvelope(
          2,
          "2026-10-02T10:00:03Z",
          quote(101, "2026-10-02T10:00:02Z"),
        ),
      ),
    ).toThrow("market data sequence must be greater than the current sequence");

    expect(() =>
      applyMarketData(
        state,
        createMarketDataEnvelope(
          1,
          "2026-10-02T10:00:03Z",
          quote(99, "2026-10-02T10:00:00Z"),
        ),
      ),
    ).toThrow("market data sequence must be greater than the current sequence");
  });

  it("rejects older observations even when the sequence is newer", () => {
    const state = applyMarketData(
      createMarketDataState(AAPL),
      createMarketDataEnvelope(
        2,
        "2026-10-02T10:00:02Z",
        quote(100, "2026-10-02T10:00:01Z"),
      ),
    );

    expect(() =>
      applyMarketData(
        state,
        createMarketDataEnvelope(
          3,
          "2026-10-02T10:00:03Z",
          quote(99, "2026-10-02T10:00:00Z"),
        ),
      ),
    ).toThrow("market data observation is older than the current state");
  });

  it("tracks each data kind independently", () => {
    const book = new MarketDataStateBook(() => "2026-10-02T10:00:05Z");

    const first = book.ingest(quote(100, "2026-10-02T10:00:01Z"));
    expect(first.lastSequence).toBe(1);

    const trade = book.ingest({
      kind: "trade",
      instrumentId: AAPL,
      price: 100.2,
      quantity: 5,
      observedAt: "2026-10-02T10:00:02Z",
    });
    expect(trade.lastSequence).toBe(2);
    expect(trade.latestQuote?.bid).toBe(100);
    expect(trade.latestTrade?.price).toBe(100.2);

    expect(book.list()).toHaveLength(1);
    expect(book.get(AAPL)?.lastSequence).toBe(2);
  });

  it("marks state stale after the configured age", () => {
    const book = new MarketDataStateBook(() => "2026-10-02T10:00:02Z");
    const state = book.ingest(quote(100, "2026-10-02T10:00:00Z"));

    expect(state.lastReceivedAt).toBe("2026-10-02T10:00:02.000Z");
    expect(state.lastObservedAt).toBe("2026-10-02T10:00:00.000Z");
    expect(isMarketDataStale(state, "2026-10-02T10:00:01Z", 1_000)).toBe(false);
    expect(isMarketDataStale(state, "2026-10-02T10:00:01.001Z", 1_000)).toBe(true);
  });
});
