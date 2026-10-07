import type { Bar } from "./market-data.js";

export interface ResearchSeries {
  readonly instrumentId: string;
  readonly bars: readonly Bar[];
}

export function createResearchSeries(instrumentId: string, bars: readonly Bar[]): ResearchSeries {
  const id = instrumentId.trim();
  if (!id) throw new Error("instrumentId must not be empty");
  const ordered = [...bars].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  for (let i = 1; i < ordered.length; i++) {
    if (Date.parse(ordered[i - 1]!.endAt) > Date.parse(ordered[i]!.startAt)) {
      throw new Error("research bars must not overlap");
    }
  }
  return Object.freeze({ instrumentId: id, bars: Object.freeze(ordered) });
}

export function sliceResearchSeries(series: ResearchSeries, from: string, to: string): ResearchSeries {
  const start = Date.parse(from), end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error("research range must be valid");
  return createResearchSeries(series.instrumentId, series.bars.filter((bar) => Date.parse(bar.startAt) >= start && Date.parse(bar.endAt) <= end));
}
