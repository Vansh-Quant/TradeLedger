import type { MarketDataBar } from "@/api/types";

/**
 * Chart presentation logic. Everything here is derived from backend payloads
 * only — no price is ever invented, and a timeframe selection maps to a real
 * provider interval (native or calendar-aggregated), never to a label.
 */

export interface ChartTimeframe {
  readonly id: string;
  readonly interval: string;
  readonly label: string;
  /** True when the backend aggregates these candles from daily history. */
  readonly aggregated: boolean;
}

export const TIMEFRAMES: readonly ChartTimeframe[] = Object.freeze([
  { id: "1m", interval: "1m", label: "1m", aggregated: false },
  { id: "5m", interval: "5m", label: "5m", aggregated: false },
  { id: "15m", interval: "15m", label: "15m", aggregated: false },
  { id: "1h", interval: "1h", label: "1H", aggregated: false },
  { id: "4h", interval: "4h", label: "4H", aggregated: false },
  { id: "1D", interval: "1d", label: "1D", aggregated: false },
  { id: "1W", interval: "1w", label: "1W", aggregated: true },
  { id: "1M", interval: "1M", label: "1M", aggregated: true },
]);

export const DEFAULT_TIMEFRAME_ID = "1h";

export function timeframe(id: string): ChartTimeframe {
  return (
    TIMEFRAMES.find((item) => item.id === id) ??
    TIMEFRAMES.find((item) => item.id === DEFAULT_TIMEFRAME_ID)!
  );
}

export interface ChartRange {
  readonly id: string;
  readonly label: string;
  /** Window length in days. "ALL" asks for more history than any interval keeps. */
  readonly days: number;
}

export const RANGES: readonly ChartRange[] = Object.freeze([
  { id: "1D", label: "1D", days: 1 },
  { id: "5D", label: "5D", days: 5 },
  { id: "1M", label: "1M", days: 30 },
  { id: "3M", label: "3M", days: 90 },
  { id: "6M", label: "6M", days: 180 },
  { id: "12M", label: "12M", days: 365 },
  { id: "ALL", label: "ALL", days: 730 },
]);

export const DEFAULT_RANGE_ID = "ALL";

export function range(id: string): ChartRange {
  return (
    RANGES.find((item) => item.id === id) ?? RANGES.find((item) => item.id === DEFAULT_RANGE_ID)!
  );
}

/** Requested window for a range preset, as canonical ISO instants. */
export function historyWindow(rangeId: string, nowMs: number): { startAt: string; endAt: string } {
  const selected = range(rangeId);
  return {
    startAt: new Date(nowMs - selected.days * 86_400_000).toISOString(),
    endAt: new Date(nowMs).toISOString(),
  };
}

export interface CandleView {
  readonly time: number;
  readonly label: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  /** [low, high] — the range value recharts renders as one candle body. */
  readonly range: [number, number];
  readonly up: boolean;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Axis/tooltip label derived from the bar's own timeframe. */
export function formatBarTime(timeMs: number, timeframeSeconds: number): string {
  const date = new Date(timeMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  if (timeframeSeconds >= 86_400) return day;
  return `${day} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

/**
 * Maps backend bars onto the chart. Bars are re-validated here so a malformed
 * payload renders nothing instead of a plausible-looking candle.
 */
export function toCandles(bars: readonly MarketDataBar[]): CandleView[] {
  const byTime = new Map<number, CandleView>();
  for (const bar of bars) {
    const time = Date.parse(bar.startAt);
    if (!Number.isFinite(time)) continue;
    if (!finite(bar.open) || !finite(bar.high) || !finite(bar.low) || !finite(bar.close)) continue;
    if (bar.high < bar.low) continue;
    byTime.set(time, {
      time,
      label: formatBarTime(time, bar.timeframeSeconds),
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      range: [bar.low, bar.high],
      up: bar.close >= bar.open,
    });
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

/** Display precision derived from the actual values (never a fixed guess). */
export function pricePrecision(values: readonly number[]): number {
  let precision = 0;
  for (const value of values.slice(0, 500)) {
    if (!finite(value)) continue;
    const text = String(value);
    if (text.includes("e") || text.includes("E")) continue;
    const decimals = text.split(".")[1]?.length ?? 0;
    precision = Math.max(precision, Math.min(decimals, 6));
  }
  return precision;
}

export function formatPriceFixed(value: number, precision: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
}

export interface CoverageText {
  readonly candles: number;
  readonly from: string | null;
  readonly to: string | null;
  readonly summary: string;
}

export function describeCoverage(
  coverage: { count: number; returnedFrom?: string | null; returnedTo?: string | null } | undefined,
): CoverageText {
  if (coverage === undefined || coverage.count === 0) {
    return {
      candles: 0,
      from: null,
      to: null,
      summary: "No candles returned for this symbol and interval.",
    };
  }
  const from = coverage.returnedFrom ?? null;
  const to = coverage.returnedTo ?? null;
  return {
    candles: coverage.count,
    from,
    to,
    summary: `${coverage.count} candles · ${from ?? "?"} → ${to ?? "?"}`,
  };
}

/** Age of a fetched payload in a compact human form. */
export function describeAge(ageMs: number): string {
  if (ageMs < 0) return "just now";
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

/**
 * Normalises instrument search input into a provider symbol: separators are
 * stripped (XAU/USD → XAUUSD) and a small alias table maps common names.
 * Anything unknown is passed through for the provider to accept or reject.
 */
const SYMBOL_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  GOLD: "XAUUSD",
  XAUUSD: "XAUUSD",
  EURUSD: "EURUSD",
  USDJPY: "USDJPY",
  BTCUSD: "BTCUSD",
  NAS100: "NAS100",
  US100: "NAS100",
  NASDAQ100: "NAS100",
});

export function normalizeSymbolQuery(input: string): string {
  const compact = input
    .trim()
    .toUpperCase()
    .replace(/[\s/_-]+/g, "");
  if (compact.length === 0) return "";
  return SYMBOL_ALIASES[compact] ?? compact;
}
