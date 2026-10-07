export interface ResearchCacheEntry<T> {
  readonly key: string;
  readonly createdAt: string;
  readonly expiresAt?: string;
  readonly value: T;
}

export interface ResearchCache<T> {
  readonly entries: readonly ResearchCacheEntry<T>[];
}

export function createResearchCache<T>(): ResearchCache<T> {
  return Object.freeze({ entries: Object.freeze([]) });
}

export function putResearchCache<T>(
  cache: ResearchCache<T>,
  entry: ResearchCacheEntry<T>,
): ResearchCache<T> {
  if (!entry.key.trim()) throw new Error("cache key must not be empty");
  if (!Number.isFinite(Date.parse(entry.createdAt))) throw new Error("createdAt must be a valid timestamp");
  if (entry.expiresAt !== undefined && Date.parse(entry.expiresAt) <= Date.parse(entry.createdAt)) {
    throw new Error("expiresAt must be after createdAt");
  }
  const entries = cache.entries.filter((item) => item.key !== entry.key);
  return Object.freeze({ entries: Object.freeze([...entries, Object.freeze(entry)]) });
}

export function getResearchCache<T>(
  cache: ResearchCache<T>,
  key: string,
  now: string,
): T | undefined {
  const entry = cache.entries.find((item) => item.key === key);
  if (entry === undefined) return undefined;
  if (entry.expiresAt !== undefined && Date.parse(now) >= Date.parse(entry.expiresAt)) return undefined;
  return entry.value;
}
