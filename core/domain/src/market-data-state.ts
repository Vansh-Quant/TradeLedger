import type { InstrumentId } from "./instrument.js";
import type { MarketDataEnvelope, MarketDataPoint, Quote, TradePrint, Bar } from "./market-data.js";

export interface MarketDataState {
  readonly instrumentId: InstrumentId;
  readonly latestQuote?: Quote;
  readonly latestTrade?: TradePrint;
  readonly latestBar?: Bar;
  readonly lastSequence: number;
  readonly lastObservedAt: string;
  readonly lastReceivedAt: string;
}

export function createMarketDataState(instrumentId: InstrumentId): MarketDataState {
  return Object.freeze({
    instrumentId,
    lastSequence: 0,
    lastObservedAt: new Date(0).toISOString(),
    lastReceivedAt: new Date(0).toISOString(),
  });
}

function assertTimestamp(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(field + " must be a valid timestamp");
  return parsed;
}

export function applyMarketData(
  state: MarketDataState,
  envelope: MarketDataEnvelope,
): MarketDataState {
  if (envelope.data.instrumentId !== state.instrumentId) {
    throw new Error("market data instrument does not match state");
  }

  if (envelope.sequence <= state.lastSequence) {
    throw new Error("market data sequence must be greater than the current sequence");
  }

  const observedAt = assertTimestamp(envelope.data.kind === "bar" ? envelope.data.endAt : envelope.data.observedAt, "observedAt");
  const receivedAt = assertTimestamp(envelope.receivedAt, "receivedAt");
  const previousObservedAt = assertTimestamp(state.lastObservedAt, "lastObservedAt");

  if (observedAt < previousObservedAt) {
    throw new Error("market data observation is older than the current state");
  }

  return Object.freeze({
    instrumentId: state.instrumentId,
    ...(envelope.data.kind === "quote" ? { latestQuote: envelope.data } : state.latestQuote === undefined ? {} : { latestQuote: state.latestQuote }),
    ...(envelope.data.kind === "trade" ? { latestTrade: envelope.data } : state.latestTrade === undefined ? {} : { latestTrade: state.latestTrade }),
    ...(envelope.data.kind === "bar" ? { latestBar: envelope.data } : state.latestBar === undefined ? {} : { latestBar: state.latestBar }),
    lastSequence: envelope.sequence,
    lastObservedAt: new Date(observedAt).toISOString(),
    lastReceivedAt: new Date(receivedAt).toISOString(),
  });
}

export function isMarketDataStale(
  state: MarketDataState,
  now: string,
  maxAgeMs: number,
): boolean {
  if (!Number.isInteger(maxAgeMs) || maxAgeMs < 0) {
    throw new Error("maxAgeMs must be a non-negative integer");
  }

  const current = assertTimestamp(now, "now");
  const observed = assertTimestamp(state.lastObservedAt, "lastObservedAt");
  return current - observed > maxAgeMs;
}
