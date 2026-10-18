import { describe, expect, it } from "vitest";
import {
  assessMarketDataQuality,
  createQuote,
  type InstrumentId,
  type MarketDataQualityPolicy,
} from "../../core/domain/src/index.js";

const policy: MarketDataQualityPolicy = {
  maxAgeMs: 2_000,
  maxSpreadBps: 20,
  maxFutureSkewMs: 250,
};

function quote(overrides: Partial<Parameters<typeof createQuote>[0]> = {}) {
  return createQuote({
    instrumentId: "AAPL" as InstrumentId,
    bid: 99.9,
    bidSize: 10,
    ask: 100.1,
    askSize: 12,
    observedAt: "2026-10-18T10:00:00.000Z",
    source: "test-feed",
    ...overrides,
  });
}

describe("market data quality guard", () => {
  it("accepts a fresh quote within the spread limit", () => {
    const result = assessMarketDataQuality(
      quote(),
      "2026-10-18T10:00:01.000Z",
      policy,
    );
    expect(result.status).toBe("healthy");
    expect(result.usable).toBe(true);
    expect(result.ageMs).toBe(1_000);
    expect(result.spreadBps).toBeCloseTo(19.98, 1);
    expect(result.reasons).toEqual([]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.reasons)).toBe(true);
  });

  it("blocks a missing quote without inventing a price", () => {
    expect(assessMarketDataQuality(null, "2026-10-18T10:00:01.000Z", policy))
      .toMatchObject({
        status: "missing",
        usable: false,
        ageMs: null,
        spreadBps: null,
        reasons: ["quote is missing"],
      });
  });

  it("blocks stale quotes", () => {
    const result = assessMarketDataQuality(
      quote(),
      "2026-10-18T10:00:03.000Z",
      policy,
    );
    expect(result.status).toBe("stale");
    expect(result.usable).toBe(false);
    expect(result.reasons).toContain("quote is stale");
  });

  it("blocks quotes outside the allowed future clock skew", () => {
    const result = assessMarketDataQuality(
      quote({ observedAt: "2026-10-18T10:00:01.000Z" }),
      "2026-10-18T10:00:00.000Z",
      policy,
    );
    expect(result.status).toBe("future-dated");
    expect(result.usable).toBe(false);
  });

  it("allows small future skew within the configured tolerance", () => {
    const result = assessMarketDataQuality(
      quote({ observedAt: "2026-10-18T10:00:00.100Z" }),
      "2026-10-18T10:00:00.000Z",
      policy,
    );
    expect(result.status).toBe("healthy");
    expect(result.usable).toBe(true);
  });

  it("blocks a fresh quote whose spread exceeds the limit", () => {
    const result = assessMarketDataQuality(
      quote({ bid: 99, ask: 101 }),
      "2026-10-18T10:00:01.000Z",
      policy,
    );
    expect(result.status).toBe("wide-spread");
    expect(result.usable).toBe(false);
    expect(result.reasons).toContain("quote spread exceeds configured limit");
  });

  it("reports all quality problems instead of hiding one", () => {
    const result = assessMarketDataQuality(
      quote({ bid: 99, ask: 101 }),
      "2026-10-18T10:00:03.000Z",
      policy,
    );
    expect(result.status).toBe("stale");
    expect(result.reasons).toEqual([
      "quote is stale",
      "quote spread exceeds configured limit",
    ]);
  });

  it("validates policy and evaluation timestamps", () => {
    expect(() => assessMarketDataQuality(quote(), "invalid", policy))
      .toThrow("now must be a valid timestamp");
    expect(() => assessMarketDataQuality(quote(), "2026-10-18T10:00:00Z", {
      ...policy,
      maxAgeMs: -1,
    })).toThrow("maxAgeMs must be a non-negative integer");
    expect(() => assessMarketDataQuality(quote(), "2026-10-18T10:00:00Z", {
      ...policy,
      maxSpreadBps: 0,
    })).toThrow("maxSpreadBps must be a finite positive number");
  });
});
