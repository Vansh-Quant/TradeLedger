/**
 * Canonical trading intent for TradeLedger.
 *
 * Orders describe what the trader wants to do. Strategy selection, account
 * risk, instrument-specific trading rules, and broker execution belong to
 * other layers.
 */

import type { InstrumentId } from "./instrument.js";
import type { AccountId } from "./account.js";

export const ORDER_SIDES = ["buy", "sell"] as const;
export type OrderSide = (typeof ORDER_SIDES)[number];

export const ORDER_TYPES = ["market", "limit", "stop", "stop-limit"] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export const TIME_IN_FORCE_VALUES = ["day", "gtc", "ioc", "fok"] as const;
export type TimeInForce = (typeof TIME_IN_FORCE_VALUES)[number];

export const ORDER_STATUSES = ["created"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type OrderId = string & { readonly __brand: "OrderId" };

export interface OrderInput {
  readonly id: string;
  readonly accountId: string;
  readonly instrumentId: InstrumentId;
  readonly side: OrderSide;
  readonly type: OrderType;
  readonly quantity: number;
  readonly limitPrice?: number;
  readonly stopPrice?: number;
  readonly timeInForce: TimeInForce;
  readonly createdAt: string;
}

export interface Order {
  readonly id: OrderId;
  readonly accountId: AccountId;
  readonly instrumentId: InstrumentId;
  readonly side: OrderSide;
  readonly type: OrderType;
  readonly quantity: number;
  readonly limitPrice?: number;
  readonly stopPrice?: number;
  readonly timeInForce: TimeInForce;
  readonly status: OrderStatus;
  readonly createdAt: string;
}

function requireNonEmpty(value: string, field: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new Error(`${field} must not be empty`);
  }

  return normalized;
}

function requirePositiveFinite(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} must be a finite positive number`);
  }

  return value;
}

function requireValidValue<T extends string>(
  value: string,
  allowed: readonly T[],
  field: string,
): T {
  if (!allowed.includes(value as T)) {
    throw new Error(`${field} must be one of: ${allowed.join(", ")}`);
  }

  return value as T;
}

function requireValidCreatedAt(value: string): string {
  const normalized = requireNonEmpty(value, "createdAt");
  const timestamp = Date.parse(normalized);

  if (!Number.isFinite(timestamp)) {
    throw new Error("createdAt must be a valid timestamp");
  }

  return normalized;
}

function validatePricePresence(
  type: OrderType,
  limitPrice: number | undefined,
  stopPrice: number | undefined,
): void {
  const hasLimitPrice = limitPrice !== undefined;
  const hasStopPrice = stopPrice !== undefined;

  switch (type) {
    case "market":
      if (hasLimitPrice || hasStopPrice) {
        throw new Error("market orders must not have limitPrice or stopPrice");
      }
      break;

    case "limit":
      if (!hasLimitPrice || hasStopPrice) {
        throw new Error("limit orders require limitPrice and must not have stopPrice");
      }
      break;

    case "stop":
      if (hasLimitPrice || !hasStopPrice) {
        throw new Error("stop orders require stopPrice and must not have limitPrice");
      }
      break;

    case "stop-limit":
      if (!hasLimitPrice || !hasStopPrice) {
        throw new Error("stop-limit orders require both limitPrice and stopPrice");
      }
      break;
  }
}

/**
 * Creates a validated, immutable Order representing trading intent.
 *
 * Instrument-specific price/quantity rules and account risk checks are
 * intentionally outside this factory and belong to their respective layers.
 */
export function createOrder(input: OrderInput): Order {
  const id = requireNonEmpty(input.id, "id") as OrderId;
  const accountId = requireNonEmpty(input.accountId, "accountId") as AccountId;
  const instrumentId = requireNonEmpty(input.instrumentId, "instrumentId") as InstrumentId;
  const side = requireValidValue(input.side, ORDER_SIDES, "side");
  const type = requireValidValue(input.type, ORDER_TYPES, "type");
  const timeInForce = requireValidValue(
    input.timeInForce,
    TIME_IN_FORCE_VALUES,
    "timeInForce",
  );
  const quantity = requirePositiveFinite(input.quantity, "quantity");

  const limitPrice = input.limitPrice === undefined
    ? undefined
    : requirePositiveFinite(input.limitPrice, "limitPrice");
  const stopPrice = input.stopPrice === undefined
    ? undefined
    : requirePositiveFinite(input.stopPrice, "stopPrice");

  validatePricePresence(type, limitPrice, stopPrice);

  const order: Order = {
    id,
    accountId,
    instrumentId,
    side,
    type,
    quantity,
    ...(limitPrice === undefined ? {} : { limitPrice }),
    ...(stopPrice === undefined ? {} : { stopPrice }),
    timeInForce,
    status: "created",
    createdAt: requireValidCreatedAt(input.createdAt),
  };

  return Object.freeze(order);
}
