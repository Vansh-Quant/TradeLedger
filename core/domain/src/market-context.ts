import type { IntelligenceEvent } from "./intelligence.js";

export interface MarketContext {
  readonly instrumentId: string;
  readonly asOf: string;
  readonly eventIds: readonly string[];
  readonly highImpactCount: number;
  readonly criticalCount: number;
  readonly latestEventAt?: string;
  readonly tags: readonly string[];
}

export function buildMarketContext(
  instrumentId: string,
  asOf: string,
  events: readonly IntelligenceEvent[],
): MarketContext {
  if (!instrumentId.trim()) throw new Error("instrumentId must not be empty");
  if (!Number.isFinite(Date.parse(asOf))) throw new Error("asOf must be a valid timestamp");
  const relevant = events
    .filter((event) => event.instruments.includes(instrumentId) && Date.parse(event.publishedAt) <= Date.parse(asOf))
    .sort((a,b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  const tags = [...new Set(relevant.flatMap((event) => event.tags))].sort();
  return Object.freeze({
    instrumentId,
    asOf,
    eventIds: Object.freeze(relevant.map((event) => event.id)),
    highImpactCount: relevant.filter((event) => event.impact === "high").length,
    criticalCount: relevant.filter((event) => event.impact === "critical").length,
    latestEventAt: relevant[0]?.publishedAt,
    tags: Object.freeze(tags),
  });
}
