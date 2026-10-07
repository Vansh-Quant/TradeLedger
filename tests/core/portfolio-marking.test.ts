import { describe, expect, it } from "vitest";
import {
  applyMarketData,
  createMarketDataEnvelope,
  createMarketDataState,
  createQuote,
  deriveMarkPrices,
  type InstrumentId,
} from "../../core/domain/src/index.js";

const AAPL = "AAPL" as InstrumentId;

describe("portfolio market marking", () => {
  it("prefers quote midpoint over trade and bar marks", () => {
    let state = createMarketDataState(AAPL);
    const quote = createQuote({
      instrumentId: AAPL,
      bid: 99,
      bidSize: 10,
      ask: 101,
      askSize: 10,
      observedAt: "2026-10-07T10:00:00Z",
    });

    state = applyMarketData(
      state,
      createMarketDataEnvelope(
        1,
        "2026-10-07T10:00:01Z",
        quote,
      ),
    );

    state = {
      ...state,
      latestTrade: {
        kind: "trade" as const,
        instrumentId: AAPL,
        price: 105,
        quantity: 1,
        observedAt: "2026-10-07T10:00:00Z",
      },
    };

    const marks = deriveMarkPrices(
      [state],
      "2026-10-07T10:00:02Z",
      { maxAgeMs: 5_000, rejectStale: true },
    );

    expect(marks.get(AAPL)).toBe(100);
  });

  it("rejects stale market state when policy requires fresh data", () => {
    const state = {
      ...createMarketDataState(AAPL),
      latestQuote: createQuote({
        instrumentId: AAPL,
        bid: 99,
        bidSize: 10,
        ask: 101,
        askSize: 10,
        observedAt: "2026-10-07T10:00:00Z",
      }),
      lastObservedAt: "2026-10-07T10:00:00.000Z",
    };

    expect(() =>
      deriveMarkPrices(
        [state],
        "2026-10-07T10:01:00Z",
        { maxAgeMs: 5_000, rejectStale: true },
      ),
    ).toThrow("market data is stale for instrument AAPL");
  });
});
