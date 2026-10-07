export const INTELLIGENCE_EVENT_TYPES = [
  "economic", "central_bank", "earnings", "filing", "news", "macro", "guidance"
] as const;
export type IntelligenceEventType = (typeof INTELLIGENCE_EVENT_TYPES)[number];

export const IMPACT_LEVELS = ["low","medium","high","critical"] as const;
export type ImpactLevel = (typeof IMPACT_LEVELS)[number];

export interface IntelligenceEvent {
  readonly id: string;
  readonly type: IntelligenceEventType;
  readonly title: string;
  readonly summary: string;
  readonly source: string;
  readonly publishedAt: string;
  readonly effectiveAt?: string;
  readonly instruments: readonly string[];
  readonly regions: readonly string[];
  readonly impact: ImpactLevel;
  readonly tags: readonly string[];
}

function text(value: string, field: string): string {
  const v = value.trim();
  if (!v) throw new Error(field + " must not be empty");
  return v;
}
function time(value: string, field: string): string {
  text(value, field);
  if (!Number.isFinite(Date.parse(value))) throw new Error(field + " must be a valid timestamp");
  return value;
}

export function createIntelligenceEvent(input: {
  readonly id: string; readonly type: IntelligenceEventType; readonly title: string; readonly summary: string;
  readonly source: string; readonly publishedAt: string; readonly effectiveAt?: string;
  readonly instruments?: readonly string[]; readonly regions?: readonly string[]; readonly impact?: ImpactLevel;
  readonly tags?: readonly string[];
}): IntelligenceEvent {
  if (!INTELLIGENCE_EVENT_TYPES.includes(input.type)) throw new Error("type is invalid");
  if (!IMPACT_LEVELS.includes(input.impact ?? "medium")) throw new Error("impact is invalid");
  const instruments = (input.instruments ?? []).map((x) => text(x, "instrument"));
  const regions = (input.regions ?? []).map((x) => text(x, "region"));
  const tags = (input.tags ?? []).map((x) => text(x, "tag"));
  const publishedAt = time(input.publishedAt, "publishedAt");
  const effectiveAt = input.effectiveAt === undefined ? undefined : time(input.effectiveAt, "effectiveAt");
  if (effectiveAt !== undefined && Date.parse(effectiveAt) < Date.parse(publishedAt)) throw new Error("effectiveAt cannot precede publishedAt");
  return Object.freeze({
    id: text(input.id, "id"),
    type: input.type,
    title: text(input.title, "title"),
    summary: text(input.summary, "summary"),
    source: text(input.source, "source"),
    publishedAt,
    ...(effectiveAt === undefined ? {} : { effectiveAt }),
    instruments: Object.freeze(instruments),
    regions: Object.freeze(regions),
    impact: input.impact ?? "medium",
    tags: Object.freeze(tags),
  });
}

export interface IntelligenceArchive {
  readonly events: readonly IntelligenceEvent[];
}

export function createIntelligenceArchive(): IntelligenceArchive {
  return Object.freeze({ events: Object.freeze([]) });
}

export function appendIntelligenceEvent(archive: IntelligenceArchive, event: IntelligenceEvent): IntelligenceArchive {
  if (archive.events.some((item) => item.id === event.id)) return archive;
  const events = [...archive.events, event].sort((a,b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  return Object.freeze({ events: Object.freeze(events) });
}

export function queryIntelligence(
  archive: IntelligenceArchive,
  query: {
    readonly type?: IntelligenceEventType;
    readonly impactAtLeast?: ImpactLevel;
    readonly instrumentId?: string;
    readonly region?: string;
    readonly tag?: string;
    readonly from?: string;
    readonly to?: string;
  },
): readonly IntelligenceEvent[] {
  const rank: Record<ImpactLevel, number> = { low: 1, medium: 2, high: 3, critical: 4 };
  const from = query.from === undefined ? Number.NEGATIVE_INFINITY : Date.parse(query.from);
  const to = query.to === undefined ? Number.POSITIVE_INFINITY : Date.parse(query.to);
  if (!Number.isFinite(from) && query.from !== undefined) throw new Error("from must be a valid timestamp");
  if (!Number.isFinite(to) && query.to !== undefined) throw new Error("to must be a valid timestamp");
  return Object.freeze(archive.events.filter((event) =>
    (query.type === undefined || event.type === query.type) &&
    (query.impactAtLeast === undefined || rank[event.impact] >= rank[query.impactAtLeast]) &&
    (query.instrumentId === undefined || event.instruments.includes(query.instrumentId)) &&
    (query.region === undefined || event.regions.includes(query.region)) &&
    (query.tag === undefined || event.tags.includes(query.tag)) &&
    Date.parse(event.publishedAt) >= from &&
    Date.parse(event.publishedAt) <= to,
  ));
}
