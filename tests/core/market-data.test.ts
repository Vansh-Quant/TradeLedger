import { describe, expect, it } from "vitest";
import {
  createBar,
  createMarketDataEnvelope,
  createQuote,
  createTradePrint,
  midPrice,
  spread,
  type InstrumentId,
} from "../../core/domain/src/index.js";

const instrumentId = "AAPL" as InstrumentId;

describe("market data foundation", () => {
  it("creates an immutable quote", () => {
    const quote = createQuote({
      instrumentId,
      bid: 100,
      bidSize: 10,
      ask: 100.25,
      askSize: 12,
      observedAt: "2026-10-02T10:00:00Z",
      source: "demo-feed",
    });

    expect(quote.kind).toBe("quote");
    expect(Object.isFrozen(quote)).toBe(true);
    expect(midPrice(quote)).toBe(100.125);
    expect(spread(quote)).toBe(0.25);
  });

  it("rejects crossed quotes", () => {
    expect(() =>
      createQuote({
        instrumentId,
        bid: 101,
        bidSize: 10,
        ask: 100,
        askSize: 10,
        observedAt: "2026-10-02T10:00:00Z",
      }),
    ).toThrow("bid must be less than or equal to ask");
  });

  it("creates an immutable trade print", () => {
    const trade = createTradePrint({
      instrumentId,
      price: 100.1,
      quantity: 25,
      observedAt: "2026-10-02T10:00:01Z",
      side: "buy",
    });

    expect(trade.kind).toBe("trade");
    expect(trade.quantity).toBe(25);
    expect(Object.isFrozen(trade)).toBe(true);
  });

  it("creates a valid OHLCV bar", () => {
    const bar = createBar({
      instrumentId,
      timeframeSeconds: 60,
      startAt: "2026-10-02T10:00:00Z",
      endAt: "2026-10-02T10:01:00Z",
      open: 100,
      high: 101,
      low: 99,
      close: 100.5,
      volume: 1000,
    });

    expect(bar.kind).toBe("bar");
    expect(bar.high).toBe(101);
    expect(bar.low).toBe(99);
  });

  it("rejects invalid OHLC relationships", () => {
    expect(() =>
      createBar({
        instrumentId,
        timeframeSeconds: 60,
        startAt: "2026-10-02T10:00:00Z",
        endAt: "2026-10-02T10:01:00Z",
        open: 100,
        high: 99,
        low: 98,
        close: 100,
        volume: 10,
      }),
    ).toThrow("high must be greater than or equal to open and close");
  });

  it("creates a sequenced market-data envelope", () => {
    const quote = createQuote({
      instrumentId,
      bid: 100,
      bidSize: 10,
      ask: 100.25,
      askSize: 10,
      observedAt: "2026-10-02T10:00:00Z",
    });

    const envelope = createMarketDataEnvelope(
      1,
      "2026-10-02T10:00:02Z",
      quote,
    );

    expect(envelope.sequence).toBe(1);
    expect(envelope.data).toBe(quote);
  });

  it("rejects invalid envelope sequences", () => {
    const quote = createQuote({
      instrumentId,
      bid: 100,
      bidSize: 10,
      ask: 100.25,
      askSize: 10,
      observedAt: "2026-10-02T10:00:00Z",
    });

    expect(() =>
      createMarketDataEnvelope(0, "2026-10-02T10:00:02Z", quote),
    ).toThrow("sequence must be a positive integer");
  });

  it("rejects negative volume", () => {
    expect(() =>
      createBar({
        instrumentId,
        timeframeSeconds: 60,
        startAt: "2026-10-02T10:00:00Z",
        endAt: "2026-10-02T10:01:00Z",
        open: 100,
        high: 101,
        low: 99,
        close: 100,
        volume: -1,
      }),
    ).toThrow("volume must be a finite non-negative number");

  });
});
