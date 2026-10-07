import type { InstrumentId } from "./instrument.js";
import { midPrice } from "./market-data.js";
import {
  isMarketDataStale,
  type MarketDataState,
} from "./market-data-state.js";

export interface MarkPricePolicy {
  readonly maxAgeMs: number;
  readonly rejectStale: boolean;
}

function requireNonNegativeInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(field + " must be a non-negative integer");
  }
  return value;
}

/**
 * Derives deterministic mark prices from the latest available market state.
 * Quote midpoint is preferred, then latest trade, then latest bar close.
 */
export function deriveMarkPrices(
  states: readonly MarketDataState[],
  now: string,
  policy: MarkPricePolicy,
): ReadonlyMap<InstrumentId, number> {
  const maxAgeMs = requireNonNegativeInteger(policy.maxAgeMs, "maxAgeMs");
  const marks = new Map<InstrumentId, number>();

  for (const state of states) {
    if (
      policy.rejectStale &&
      isMarketDataStale(state, now, maxAgeMs)
    ) {
      throw new Error("market data is stale for instrument " + state.instrumentId);
    }

    const mark =
      state.latestQuote !== undefined
        ? midPrice(state.latestQuote)
        : state.latestTrade !== undefined
          ? state.latestTrade.price
          : state.latestBar !== undefined
            ? state.latestBar.close
            : undefined;

    if (mark !== undefined) {
      marks.set(state.instrumentId, mark);
    }
  }

  return marks;
}
