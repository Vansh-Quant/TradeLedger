import type { ImpactLevel, IntelligenceEvent, IntelligenceEventType } from "./intelligence.js";

const rank: Record<ImpactLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export interface IntelligenceFeedItem {
  readonly event: IntelligenceEvent;
  readonly relevance: number;
}

export function rankIntelligence(
  events: readonly IntelligenceEvent[],
  input: {
    readonly instrumentId?: string;
    readonly types?: readonly IntelligenceEventType[];
    readonly impactAtLeast?: ImpactLevel;
  } = {},
): readonly IntelligenceFeedItem[] {
  const typeSet = input.types === undefined ? undefined : new Set(input.types);
  const minimum = input.impactAtLeast === undefined ? 1 : rank[input.impactAtLeast];

  const items = events
    .filter((event) =>
      (input.instrumentId === undefined || event.instruments.includes(input.instrumentId)) &&
      (typeSet === undefined || typeSet.has(event.type)) &&
      rank[event.impact] >= minimum,
    )
    .map((event) => Object.freeze({
      event,
      relevance:
        rank[event.impact] * 100 +
        (input.instrumentId !== undefined && event.instruments.includes(input.instrumentId) ? 25 : 0),
    }))
    .sort((a, b) =>
      b.relevance - a.relevance ||
      Date.parse(b.event.publishedAt) - Date.parse(a.event.publishedAt),
    );

  return Object.freeze(items);
}
