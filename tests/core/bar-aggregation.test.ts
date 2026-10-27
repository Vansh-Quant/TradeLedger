import { describe, expect, it } from "vitest";
import {
  aggregateDailyBars, alignAggregationRange, createBar, isBarAggregationTarget,
  type Bar, type InstrumentId,
} from "../../core/domain/src/index.js";

const EURUSD = "EURUSD" as InstrumentId;

function daily(day: string, overrides: Partial<{ open: number; high: number; low: number; close: number; volume: number }> = {}): Bar {
  const start = `${day}T00:00:00.000Z`;
  const end = new Date(Date.parse(start) + 86_400_000).toISOString();
  const close = overrides.close ?? 1.15;
  const open = overrides.open ?? close;
  return createBar({
    instrumentId: EURUSD, timeframeSeconds: 86_400,
    startAt: start, endAt: end,
    open, high: overrides.high ?? Math.max(open, close), low: overrides.low ?? Math.min(open, close),
    close, volume: overrides.volume ?? 0, source: "biquote",
  });
}

describe("bar aggregation", () => {
  it("aggregates daily bars into calendar weeks (Monday UTC boundaries)", () => {
    // 2026-10-01 is a Thursday; weeks roll on Monday 2026-10-05.
    const bars = [
      daily("2026-10-01", { open: 1.10, close: 1.11, high: 1.12, low: 1.09 }),
      daily("2026-10-02", { open: 1.11, close: 1.13, high: 1.14, low: 1.10, volume: 5 }),
      daily("2026-10-05", { open: 1.13, close: 1.15, high: 1.16, low: 1.12, volume: 7 }),
      daily("2026-10-06", { open: 1.15, close: 1.09, high: 1.17, low: 1.08, volume: 9 }),
    ];
    const weekly = aggregateDailyBars(bars, "1w");

    expect(weekly).toHaveLength(2);
    const [first, second] = weekly;
    // The first group never claims a period starting before its source data.
    expect(first!.startAt).toBe("2026-10-01T00:00:00.000Z");
    expect(first!.endAt).toBe("2026-10-05T00:00:00.000Z");
    expect(first!.timeframeSeconds).toBe(4 * 86_400);
    expect(first).toMatchObject({ open: 1.10, high: 1.14, low: 1.09, close: 1.13, volume: 5, source: "biquote" });

    expect(second!.startAt).toBe("2026-10-05T00:00:00.000Z");
    expect(second!.endAt).toBe("2026-10-12T00:00:00.000Z");
    expect(second!.timeframeSeconds).toBe(7 * 86_400);
    expect(second).toMatchObject({ open: 1.13, high: 1.17, low: 1.08, close: 1.09, volume: 16 });
  });

  it("aggregates across month and year boundaries with correct period lengths", () => {
    const bars = [
      daily("2026-12-30", { close: 1.20 }),
      daily("2026-12-31", { close: 1.21 }),
      daily("2027-01-01", { close: 1.22 }),
      daily("2027-02-01", { close: 1.25 }),
      daily("2027-02-26", { close: 1.24 }),
    ];
    const monthly = aggregateDailyBars(bars, "1M");

    expect(monthly).toHaveLength(3);
    expect(monthly[0]).toMatchObject({
      startAt: "2026-12-30T00:00:00.000Z", endAt: "2027-01-01T00:00:00.000Z",
      timeframeSeconds: 2 * 86_400, close: 1.21,
    });
    expect(monthly[1]).toMatchObject({
      startAt: "2027-01-01T00:00:00.000Z", endAt: "2027-02-01T00:00:00.000Z",
      timeframeSeconds: 31 * 86_400, close: 1.22,
    });
    // February 2027 has 28 days.
    expect(monthly[2]).toMatchObject({
      startAt: "2027-02-01T00:00:00.000Z", endAt: "2027-03-01T00:00:00.000Z",
      timeframeSeconds: 28 * 86_400, open: 1.25, close: 1.24,
    });
  });

  it("returns an empty result for empty input and recognises valid targets", () => {
    expect(aggregateDailyBars([], "1w")).toEqual([]);
    expect(isBarAggregationTarget("1w")).toBe(true);
    expect(isBarAggregationTarget("1M")).toBe(true);
    expect(isBarAggregationTarget("1h")).toBe(false);
    expect(() => aggregateDailyBars([daily("2026-10-01")], "1h")).toThrow("aggregation target");
  });

  it("refuses non-daily bars, duplicates, out-of-order bars and mixed instruments", () => {
    const intraday = createBar({
      instrumentId: EURUSD, timeframeSeconds: 3600,
      startAt: "2026-10-01T00:00:00.000Z", endAt: "2026-10-01T01:00:00.000Z",
      open: 1.1, high: 1.2, low: 1.0, close: 1.15, volume: 0,
    });
    expect(() => aggregateDailyBars([intraday], "1w")).toThrow("only daily bars");

    expect(() => aggregateDailyBars([daily("2026-10-02"), daily("2026-10-01")], "1w")).toThrow("strictly chronological");
    expect(() => aggregateDailyBars([daily("2026-10-01"), daily("2026-10-01")], "1w")).toThrow("strictly chronological");

    const other = createBar({
      instrumentId: "XAUUSD" as InstrumentId, timeframeSeconds: 86_400,
      startAt: "2026-10-03T00:00:00.000Z", endAt: "2026-10-04T00:00:00.000Z",
      open: 1.1, high: 1.2, low: 1.0, close: 1.15, volume: 0,
    });
    expect(() => aggregateDailyBars([daily("2026-10-01"), other], "1w")).toThrow("different instruments");
  });

  it("aligns a requested range down to whole calendar periods", () => {
    const week = alignAggregationRange("1w", "2026-10-07T14:30:00Z", "2026-10-20T00:00:00Z");
    expect(week.alignedFrom).toBe("2026-10-05T00:00:00.000Z");
    expect(week.fetchFrom).toBe(week.alignedFrom);

    const month = alignAggregationRange("1M", "2026-10-17T00:00:00Z", "2026-11-02T00:00:00Z");
    expect(month.alignedFrom).toBe("2026-10-01T00:00:00.000Z");

    expect(() => alignAggregationRange("1w", "not-a-date", "2026-10-20T00:00:00Z")).toThrow("valid timestamp");
    expect(() => alignAggregationRange("1w", "2026-10-20T00:00:00Z", "2026-10-20T00:00:00Z")).toThrow("must be after startAt");
    expect(() => alignAggregationRange("4h", "2026-10-01T00:00:00Z", "2026-10-20T00:00:00Z")).toThrow("aggregation target");
  });
});