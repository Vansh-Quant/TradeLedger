import type { InstrumentId } from "./instrument.js";

// Candle intervals the workstation can request: the seven native provider
// intervals plus the two calendar-aggregated periods (see aggregateDailyBars).
export const CHART_INTERVALS = ["1m","5m","15m","30m","1h","4h","1d","1w","1M"] as const;
export type ChartInterval = (typeof CHART_INTERVALS)[number];

export interface ChartViewport {
  readonly instrumentId: InstrumentId;
  readonly interval: ChartInterval;
  readonly from: string;
  readonly to: string;
  readonly indicators: readonly string[];
}

function nonEmpty(value: string, field: string): string {
  const v = value.trim();
  if (!v) throw new Error(field + " must not be empty");
  return v;
}
function validTime(value: string, field: string): string {
  nonEmpty(value, field);
  if (!Number.isFinite(Date.parse(value))) throw new Error(field + " must be a valid timestamp");
  return value;
}

export function createChartViewport(input: {
  readonly instrumentId: InstrumentId; readonly interval: ChartInterval;
  readonly from: string; readonly to: string; readonly indicators?: readonly string[];
}): ChartViewport {
  if (!CHART_INTERVALS.includes(input.interval)) throw new Error("interval is invalid");
  const from = validTime(input.from, "from");
  const to = validTime(input.to, "to");
  if (Date.parse(to) <= Date.parse(from)) throw new Error("to must be after from");
  const indicators = (input.indicators ?? []).map((x) => nonEmpty(x, "indicator"));
  if (new Set(indicators).size !== indicators.length) throw new Error("indicators must be unique");
  return Object.freeze({
    instrumentId: nonEmpty(input.instrumentId, "instrumentId") as InstrumentId,
    interval: input.interval,
    from,
    to,
    indicators: Object.freeze(indicators),
  });
}

export function withChartIndicator(viewport: ChartViewport, indicator: string): ChartViewport {
  const normalized = nonEmpty(indicator, "indicator");
  if (viewport.indicators.includes(normalized)) return viewport;
  return Object.freeze({ ...viewport, indicators: Object.freeze([...viewport.indicators, normalized]) });
}

export function withoutChartIndicator(viewport: ChartViewport, indicator: string): ChartViewport {
  return Object.freeze({ ...viewport, indicators: Object.freeze(viewport.indicators.filter((x) => x !== indicator)) });
}
