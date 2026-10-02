import type { InstrumentId } from "./instrument.js";
import type { MarketDataPoint, MarketDataKind } from "./market-data.js";

export interface MarketDataSubscription {
  readonly subscriptionId: string;
  readonly instruments: readonly InstrumentId[];
  readonly kinds: readonly MarketDataKind[];
}

export interface MarketDataProviderCapabilities {
  readonly quotes: boolean;
  readonly trades: boolean;
  readonly bars: boolean;
  readonly historical: boolean;
}

export interface MarketDataProvider {
  readonly providerId: string;
  readonly capabilities: MarketDataProviderCapabilities;

  subscribe(
    subscription: MarketDataSubscription,
    onData: (data: MarketDataPoint) => void,
  ): Promise<void>;

  unsubscribe(subscriptionId: string): Promise<void>;

  historical(
    instrumentId: InstrumentId,
    kind: MarketDataKind,
    startAt: string,
    endAt: string,
  ): Promise<readonly MarketDataPoint[]>;

  health(): Promise<MarketDataProviderHealth>;
}

export interface MarketDataProviderHealth {
  readonly providerId: string;
  readonly healthy: boolean;
  readonly checkedAt: string;
  readonly message?: string;
}

function nonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(field + " must not be empty");
  }
  return normalized;
}

function unique<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...new Set(values)]);
}

export function createMarketDataSubscription(input: {
  subscriptionId: string;
  instruments: readonly InstrumentId[];
  kinds: readonly MarketDataKind[];
}): MarketDataSubscription {
  const subscriptionId = nonEmpty(input.subscriptionId, "subscriptionId");

  if (input.instruments.length === 0) {
    throw new Error("instruments must not be empty");
  }

  if (input.kinds.length === 0) {
    throw new Error("kinds must not be empty");
  }

  return Object.freeze({
    subscriptionId,
    instruments: unique(input.instruments),
    kinds: unique(input.kinds),
  });
}

export function createProviderHealth(input: {
  providerId: string;
  healthy: boolean;
  checkedAt: string;
  message?: string;
}): MarketDataProviderHealth {
  const checkedAt = new Date(input.checkedAt);
  if (Number.isNaN(checkedAt.getTime())) {
    throw new Error("checkedAt must be a valid timestamp");
  }

  const providerId = nonEmpty(input.providerId, "providerId");
  const message = input.message?.trim();

  return Object.freeze({
    providerId,
    healthy: input.healthy,
    checkedAt: input.checkedAt,
    ...(message === undefined || message.length === 0 ? {} : { message }),
  });
}
