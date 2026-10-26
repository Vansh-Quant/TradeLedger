import { describe, expect, it } from "vitest";
import {
  DEFAULT_RANGE_ID,
  DEFAULT_TIMEFRAME_ID,
  RANGES,
  TIMEFRAMES,
  describeAge,
  describeCoverage,
  formatBarTime,
  formatPriceFixed,
  historyWindow,
  normalizeSymbolQuery,
  pricePrecision,
  range,
  timeframe,
  toCandles,
} from "@/lib/chart-view";
import type { MarketDataBar } from "@/api/types";

function bar(overrides: Partial<MarketDataBar> = {}): MarketDataBar {
  return {
    kind: "bar",
    instrumentId: "XAUUSD",
    timeframeSeconds: 3600,
    startAt: "2026-10-20T10:00:00Z",
    endAt: "2026-10-20T11:00:00Z",
    open: 4000,
    high: 4010,
    low: 3990,
    close: 4005,
    volume: 120,
    source: "biquote",
    ...overrides,
  };
}

describe("chart timeframes", () => {
  it("maps each timeframe id to a distinct provider interval", () => {
    const intervals = TIMEFRAMES.map((tf) => tf.interval);
    expect(new Set(intervals).size).toBe(intervals.length);
    expect(timeframe("1m").interval).toBe("1m");
    expect(timeframe("4h").interval).toBe("4h");
    expect(timeframe("1D").interval).toBe("1d");
  });

  it("falls back to the default timeframe for unknown ids", () => {
    expect(timeframe("nope").id).toBe(DEFAULT_TIMEFRAME_ID);
    expect(range("nope").id).toBe(DEFAULT_RANGE_ID);
  });

  it("marks only aggregated intervals as aggregated", () => {
    const aggregated = TIMEFRAMES.filter((tf) => tf.aggregated).map((tf) => tf.interval);
    expect(aggregated).toEqual(["1w", "1M"]);
  });

  it("derives a real window for each range preset", () => {
    const now = Date.parse("2026-10-20T12:00:00Z");
    const oneDay = historyWindow("1D", now);
    expect(Date.parse(oneDay.endAt) - Date.parse(oneDay.startAt)).toBe(86_400_000);
    const all = historyWindow("ALL", now);
    expect(Date.parse(all.endAt) - Date.parse(all.startAt)).toBe(730 * 86_400_000);
    expect(RANGES.map((r) => r.days)).toEqual([...RANGES.map((r) => r.days)].sort((a, b) => a - b));
  });
});

describe("toCandles", () => {
  it("maps bars to candles sorted chronologically", () => {
    const candles = toCandles([
      bar({ startAt: "2026-10-20T11:00:00Z" }),
      bar({ startAt: "2026-10-20T09:00:00Z", open: 3980, high: 3995, low: 3975, close: 3990 }),
    ]);
    expect(candles).toHaveLength(2);
    expect(candles[0]!.label < candles[1]!.label).toBe(true);
    expect(candles[0]!.open).toBe(3980);
    expect(candles[1]!.range).toEqual([3990, 4010]);
    expect(candles[1]!.up).toBe(true);
  });

  it("drops bars with impossible geometry instead of rendering them", () => {
    const candles = toCandles([
      bar({ high: 3980, low: 4010 }),
      bar({ open: Number.NaN }),
      bar({ startAt: "not-a-date" }),
      bar(),
    ]);
    expect(candles).toHaveLength(1);
  });

  it("de-duplicates bars sharing a timestamp, keeping the last payload", () => {
    const candles = toCandles([
      bar({ close: 4000, high: 4010 }),
      bar({ close: 4020, high: 4030 }),
    ]);
    expect(candles).toHaveLength(1);
    expect(candles[0]!.close).toBe(4020);
    expect(candles[0]!.high).toBe(4030);
  });

  it("marks a down candle when close is below open", () => {
    const [candle] = toCandles([bar({ close: 3995, open: 4005 })]);
    expect(candle!.up).toBe(false);
  });
});

describe("price formatting", () => {
  it("derives precision from the values themselves", () => {
    expect(pricePrecision([4000, 4000.5, 4000.25])).toBe(2);
    expect(pricePrecision([1.12345])).toBe(5);
    expect(pricePrecision([])).toBe(0);
    expect(pricePrecision([Number.NaN])).toBe(0);
  });

  it("formats with the derived precision", () => {
    expect(formatPriceFixed(1.2, 5)).toBe("1.20000");
    expect(formatPriceFixed(4000, 0)).toBe("4,000");
  });

  it("labels daily bars with the UTC date only", () => {
    expect(formatBarTime(Date.parse("2026-10-20T00:00:00Z"), 86_400)).toBe("2026-10-20");
    expect(formatBarTime(Date.parse("2026-10-20T10:05:00Z"), 300)).toBe("2026-10-20 10:05");
  });
});

describe("coverage and age text", () => {
  it("reports an honest empty state", () => {
    expect(describeCoverage(undefined).summary).toContain("No candles");
    expect(describeCoverage({ count: 0 }).candles).toBe(0);
  });

  it("summarises a real range", () => {
    const text = describeCoverage({ count: 240, returnedFrom: "2026-01-01", returnedTo: "2026-06-01" });
    expect(text.summary).toBe("240 candles · 2026-01-01 → 2026-06-01");
  });

  it("formats ages", () => {
    expect(describeAge(-5)).toBe("just now");
    expect(describeAge(5_000)).toBe("5s ago");
    expect(describeAge(65_000)).toBe("1m ago");
    expect(describeAge(7_200_000)).toBe("2h ago");
  });
});

describe("normalizeSymbolQuery", () => {
  it("canonicalises separators and known aliases", () => {
    expect(normalizeSymbolQuery("xau/usd")).toBe("XAUUSD");
    expect(normalizeSymbolQuery("  gold ")).toBe("XAUUSD");
    expect(normalizeSymbolQuery("nasdaq 100")).toBe("NAS100");
    expect(normalizeSymbolQuery("us100")).toBe("NAS100");
    expect(normalizeSymbolQuery("eur-usd")).toBe("EURUSD");
  });

  it("passes unknown symbols through unchanged rather than inventing one", () => {
    expect(normalizeSymbolQuery("zzzusd")).toBe("ZZZUSD");
    expect(normalizeSymbolQuery("   ")).toBe("");
  });
});
