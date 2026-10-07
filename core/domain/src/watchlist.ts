import type { InstrumentId } from "./instrument.js";

export interface WatchlistItem {
  readonly instrumentId: InstrumentId;
  readonly alias?: string;
  readonly addedAt: string;
  readonly rank: number;
}

export interface Watchlist {
  readonly id: string;
  readonly name: string;
  readonly items: readonly WatchlistItem[];
}

function nonEmpty(value: string, field: string): string {
  const v = value.trim();
  if (!v) throw new Error(field + " must not be empty");
  return v;
}

function timestamp(value: string, field: string): string {
  nonEmpty(value, field);
  if (!Number.isFinite(Date.parse(value))) throw new Error(field + " must be a valid timestamp");
  return value;
}

function rank(value: number): number {
  if (!Number.isInteger(value) || value < 0) throw new Error("rank must be a non-negative integer");
  return value;
}

export function createWatchlist(id: string, name: string): Watchlist {
  return Object.freeze({ id: nonEmpty(id, "id"), name: nonEmpty(name, "name"), items: Object.freeze([]) });
}

export function addToWatchlist(
  watchlist: Watchlist,
  input: { readonly instrumentId: InstrumentId; readonly addedAt: string; readonly alias?: string },
): Watchlist {
  if (watchlist.items.some((item) => item.instrumentId === input.instrumentId)) {
    return watchlist;
  }
  const item: WatchlistItem = Object.freeze({
    instrumentId: nonEmpty(input.instrumentId, "instrumentId") as InstrumentId,
    addedAt: timestamp(input.addedAt, "addedAt"),
    rank: watchlist.items.length,
    ...(input.alias === undefined ? {} : { alias: nonEmpty(input.alias, "alias") }),
  });
  return Object.freeze({ ...watchlist, items: Object.freeze([...watchlist.items, item]) });
}

export function removeFromWatchlist(watchlist: Watchlist, instrumentId: InstrumentId): Watchlist {
  const remaining = watchlist.items
    .filter((item) => item.instrumentId !== instrumentId)
    .map((item, index) => Object.freeze({ ...item, rank: index }));
  return Object.freeze({ ...watchlist, items: Object.freeze(remaining) });
}

export function reorderWatchlist(watchlist: Watchlist, instrumentIds: readonly InstrumentId[]): Watchlist {
  if (new Set(instrumentIds).size !== instrumentIds.length || instrumentIds.length !== watchlist.items.length) {
    throw new Error("reorder must contain each watchlist instrument exactly once");
  }
  const byId = new Map(watchlist.items.map((item) => [item.instrumentId, item]));
  const items = instrumentIds.map((instrumentId, index) => {
    const item = byId.get(instrumentId);
    if (!item) throw new Error("reorder contains an unknown instrument");
    return Object.freeze({ ...item, rank: index });
  });
  return Object.freeze({ ...watchlist, items: Object.freeze(items) });
}
