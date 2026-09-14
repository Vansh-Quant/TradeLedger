/**
 * Immutable record of an actual market fill in TradeLedger.
 *
 * Orders describe trading intent. Executions describe what actually happened.
 * Position state is derived from executions, not from order intent.
 */

import type { InstrumentId } from "./instrument.js";
import { ORDER_SIDES, type OrderSide } from "./order.js";

export type ExecutionId = string & { readonly __brand: "ExecutionId" };

export interface ExecutionInput {
  readonly id: string;
  readonly orderId: string;
  readonly instrumentId: InstrumentId;
  readonly side: OrderSide;
  readonly quantity: number;
  readonly price: number;
  readonly executedAt: string;
  readonly commission: number;
}

export interface Execution {
  readonly id: ExecutionId;
  readonly orderId: string;
  readonly instrumentId: InstrumentId;
  readonly side: OrderSide;
  readonly quantity: number;
  readonly price: number;
  readonly executedAt: string;
  readonly commission: number;
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

function requireNonNegativeFinite(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a finite non-negative number`);
  }

  return value;
}

function requireValidSide(value: OrderSide): OrderSide {
  if (!ORDER_SIDES.includes(value)) {
    throw new Error(`side must be one of: ${ORDER_SIDES.join(", ")}`);
  }

  return value;
}

function requireValidExecutedAt(value: string): string {
  const normalized = requireNonEmpty(value, "executedAt");
  const timestamp = Date.parse(normalized);

  if (!Number.isFinite(timestamp)) {
    throw new Error("executedAt must be a valid timestamp");
  }

  return normalized;
}

/**
 * Creates a validated, immutable Execution representing an actual fill.
 *
 * Broker connectivity, reconciliation, fees beyond the canonical commission
 * field, and execution-quality analysis intentionally belong to other layers.
 */
export function createExecution(input: ExecutionInput): Execution {
  const execution: Execution = {
    id: requireNonEmpty(input.id, "id") as ExecutionId,
    orderId: requireNonEmpty(input.orderId, "orderId"),
    instrumentId: requireNonEmpty(input.instrumentId, "instrumentId") as InstrumentId,
    side: requireValidSide(input.side),
    quantity: requirePositiveFinite(input.quantity, "quantity"),
    price: requirePositiveFinite(input.price, "price"),
    executedAt: requireValidExecutedAt(input.executedAt),
    commission: requireNonNegativeFinite(input.commission, "commission"),
  };

  return Object.freeze(execution);
}
