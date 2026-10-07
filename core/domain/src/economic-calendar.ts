import type { IntelligenceEvent, ImpactLevel } from "./intelligence.js";

export interface EconomicCalendarEvent extends IntelligenceEvent {
  readonly type: "economic";
  readonly country: string;
  readonly indicator: string;
  readonly forecast?: number;
  readonly previous?: number;
  readonly actual?: number;
}

export function createEconomicCalendarEvent(input: {
  readonly id: string; readonly title: string; readonly summary: string; readonly source: string;
  readonly publishedAt: string; readonly effectiveAt: string; readonly country: string; readonly indicator: string;
  readonly forecast?: number; readonly previous?: number; readonly actual?: number;
  readonly instruments?: readonly string[]; readonly impact?: ImpactLevel; readonly tags?: readonly string[];
}): EconomicCalendarEvent {
  if (!input.country.trim()) throw new Error("country must not be empty");
  if (!input.indicator.trim()) throw new Error("indicator must not be empty");
  const event = createEconomicBase(input);
  return Object.freeze({
    ...event,
    country: input.country.trim(),
    indicator: input.indicator.trim(),
    ...(input.forecast === undefined ? {} : { forecast: input.forecast }),
    ...(input.previous === undefined ? {} : { previous: input.previous }),
    ...(input.actual === undefined ? {} : { actual: input.actual }),
  });
}

function createEconomicBase(input: Parameters<typeof import("./intelligence.js")["createIntelligenceEvent"]>[0]) {
  throw new Error("unreachable");
}
