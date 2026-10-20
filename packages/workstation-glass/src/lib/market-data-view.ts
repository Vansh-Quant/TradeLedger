import type { MarketDataState } from "@/api/types";

/**
 * Presentation model for GET /api/v1/market-data.
 *
 * Values are read from the ingested state as-is. `last` prefers an executed
 * trade, then a completed bar, then nothing — the mid-price is never derived
 * here, because that would be a computed market price the backend did not send.
 */

export type MarketStatus = "CONNECTING" | "LIVE" | "STALE" | "EMPTY" | "UNAVAILABLE";
export type MarketTone = "positive" | "warning" | "negative" | "muted";

export interface MarketDataRow {
  instrumentId: string;
  bid: number | null;
  ask: number | null;
  last: number | null;
  source: string | null;
  sequence: number;
  observedAt: string | null;
  ageMs: number | null;
}

export interface MarketDataView {
  status: MarketStatus;
  tone: MarketTone;
  rows: MarketDataRow[];
  freshestAgeMs: number | null;
  newestReceivedAt: string | null;
}

export const DEFAULT_MAX_AGE_MS = 30_000;

export function describeMarketData(args: {
  states: MarketDataState[] | undefined;
  error: string | null;
  now: number;
  maxAgeMs?: number;
}): MarketDataView {
  const { states, error, now } = args;
  const maxAge = args.maxAgeMs ?? DEFAULT_MAX_AGE_MS;

  if (states === undefined) {
    const status: MarketStatus = error === null ? "CONNECTING" : "UNAVAILABLE";
    return { status, tone: status === "UNAVAILABLE" ? "negative" : "muted", rows: [], freshestAgeMs: null, newestReceivedAt: null };
  }

  const rows: MarketDataRow[] = states.map((state) => {
    const price = state.latestTrade?.price ?? state.latestBar?.close ?? null;
    const observedAt = state.latestQuote?.observedAt ?? state.latestTrade?.observedAt ?? state.latestBar?.endAt ?? state.lastObservedAt;
    const parsed = observedAt ? Date.parse(observedAt) : Number.NaN;
    const ageMs = Number.isFinite(parsed) ? Math.max(0, now - parsed) : null;
    return {
      instrumentId: state.instrumentId,
      bid: state.latestQuote?.bid ?? null,
      ask: state.latestQuote?.ask ?? null,
      last: price,
      source: state.latestQuote?.source ?? state.latestTrade?.source ?? state.latestBar?.source ?? null,
      sequence: state.lastSequence,
      observedAt: observedAt || null,
      ageMs,
    };
  });

  if (rows.length === 0) {
    return { status: "EMPTY", tone: "muted", rows, freshestAgeMs: null, newestReceivedAt: null };
  }

  const ages = rows.map((row) => row.ageMs).filter((age): age is number => age !== null);
  const freshestAgeMs = ages.length === 0 ? null : Math.min(...ages);

  // A timestamp is required to claim live data. Without one the data is stale
  // by definition, even if the request itself just succeeded.
  const status: MarketStatus = freshestAgeMs !== null && freshestAgeMs <= maxAge ? "LIVE" : "STALE";

  const newestReceivedAt = states
    .map((state) => state.lastReceivedAt)
    .filter((value) => value !== "")
    .sort()
    .at(-1) ?? null;

  return {
    status,
    tone: status === "LIVE" ? "positive" : "warning",
    rows,
    freshestAgeMs,
    newestReceivedAt,
  };
}

export function formatAge(ageMs: number | null): string {
  if (ageMs === null) return "unknown";
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
