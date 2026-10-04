import { describe, expect, it, vi } from "vitest";
import {
  InMemoryMarketDataEventStream,
  applyMarketDataEvent,
  createMarketDataEnvelope,
  createMarketDataState,
  createQuote,
  createTradePrint,
  createBar,
  latestBar,
  latestQuote,
  latestTrade,
  type InstrumentId,
} from "../../core/domain/src/index.js";

const AAPL = "AAPL" as InstrumentId;

function quote(sequence: number, bid: number) {
  return createMarketDataEnvelope(
    sequence,
    `2026-10-02T10:00:0${sequence}Z`,
    createQuote({
      instrumentId: AAPL,
      bid,
      bidSize: 10,
      ask: bid + 0.25,
      askSize: 10,
      observedAt: `2026-10-02T10:00:0${sequence}Z`,
    }),
  );
}

describe("market data event stream", () => {
  it("appends events in strict sequence order", () => {
    const stream = new InMemoryMarketDataEventStream();

    stream.append(quote(1, 100));
    stream.append(quote(2, 101));

    expect(stream.lastSequence).toBe(2);
    expect(stream.events().map((event) => event.sequence)).toEqual([1, 2]);
  });

  it("rejects duplicate and out-of-order sequences", () => {
    const stream = new InMemoryMarketDataEventStream();
    stream.append(quote(2, 100));

    expect(() => stream.append(quote(2, 101))).toThrow(
      "market-data sequence must be greater than the last sequence: 2",
    );
    expect(() => stream.append(quote(1, 99))).toThrow(
      "market-data sequence must be greater than the last sequence: 2",
    );
  });

  it("notifies subscribers in append order and supports unsubscribe", () => {
    const stream = new InMemoryMarketDataEventStream();
    const listener = vi.fn();
    const unsubscribe = stream.subscribe(listener);

    stream.append(quote(1, 100));
    unsubscribe();
    stream.append(quote(2, 101));

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ sequence: 1 }));
  });

  it("keeps the event history snapshot immutable", () => {
    const stream = new InMemoryMarketDataEventStream();
    stream.append(quote(1, 100));

    const events = stream.events();

    expect(Object.isFrozen(events)).toBe(true);
    expect(events).toHaveLength(1);
  });

  it("reduces quotes and trades into deterministic latest state", () => {
    let state = createMarketDataState();

    const firstQuote = quote(1, 100);
    const trade = createMarketDataEnvelope(
      2,
      "2026-10-02T10:00:02Z",
      createTradePrint({
        instrumentId: AAPL,
        price: 100.5,
        quantity: 20,
        observedAt: "2026-10-02T10:00:02Z",
      }),
    );
    const secondQuote = quote(3, 101);

    state = applyMarketDataEvent(state, firstQuote);
    state = applyMarketDataEvent(state, trade);
    state = applyMarketDataEvent(state, secondQuote);

    expect(state.lastSequence).toBe(3);
    expect(latestQuote(state, AAPL)?.bid).toBe(101);
    expect(latestTrade(state, AAPL)?.price).toBe(100.5);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.quotes)).toBe(true);
    expect(Object.isFrozen(state.trades)).toBe(true);
  });

  it("keeps bars separate by instrument and timeframe", () => {
    let state = createMarketDataState();

    const oneMinute = createBar({
      instrumentId: AAPL,
      timeframeSeconds: 60,
      startAt: "2026-10-02T10:00:00Z",
      endAt: "2026-10-02T10:01:00Z",
      open: 100,
      high: 101,
      low: 99,
      close: 100.5,
      volume: 1000,
    });

    const fiveMinute = createBar({
      instrumentId: AAPL,
      timeframeSeconds: 300,
      startAt: "2026-10-02T10:00:00Z",
      endAt: "2026-10-02T10:05:00Z",
      open: 100,
      high: 102,
      low: 98,
      close: 101,
      volume: 5000,
    });

    state = applyMarketDataEvent(
      state,
      createMarketDataEnvelope(1, "2026-10-02T10:01:00Z", oneMinute),
    );
    state = applyMarketDataEvent(
      state,
      createMarketDataEnvelope(2, "2026-10-02T10:05:00Z", fiveMinute),
    );

    expect(latestBar(state, AAPL, 60)?.close).toBe(100.5);
    expect(latestBar(state, AAPL, 300)?.close).toBe(101);
  });

  it("rejects state updates that move backwards", () => {
    const state = applyMarketDataEvent(createMarketDataState(), quote(2, 100));

    expect(() => applyMarketDataEvent(state, quote(1, 99))).toThrow(
      "market-data sequence must be greater than the last sequence: 2",
    );
  });
});
