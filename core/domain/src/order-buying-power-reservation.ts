import type { BuyingPower } from "./buying-power.js";
import type { Order } from "./order.js";

export interface OrderBuyingPowerReservation {
  readonly orderId: string;
  readonly initialAmount: number;
  readonly remainingAmount: number;
  readonly quantity: number;
}

function requireFinitePositive(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(field + " must be a positive finite number");
  }
  return value;
}

function requireFiniteNonNegative(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(field + " must be a finite non-negative number");
  }
  return value;
}

function requireNonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(field + " must not be empty");
  }
  return normalized;
}

/**
 * Creates the deterministic buying-power reservation attached to an admitted
 * order. The reservation is based on the notional already approved by the
 * admission workflow.
 */
export function createOrderBuyingPowerReservation(
  order: Order,
  reservedAmount: number,
): OrderBuyingPowerReservation {
  const amount = requireFinitePositive(reservedAmount, "reservedAmount");
  requireNonEmpty(order.id, "orderId");

  return Object.freeze({
    orderId: order.id,
    initialAmount: amount,
    remainingAmount: amount,
    quantity: order.quantity,
  });
}

/**
 * Releases the portion of a reservation corresponding to an applied fill.
 *
 * The release rate is derived from the original approved notional, not the
 * execution price. This keeps the reservation lifecycle deterministic while
 * actual cash/P&L settlement remains a separate concern.
 */
export function releaseReservationForFill(
  reservation: OrderBuyingPowerReservation,
  fillQuantity: number,
): OrderBuyingPowerReservation {
  const quantity = requireFinitePositive(fillQuantity, "fillQuantity");

  if (quantity > reservation.quantity) {
    throw new Error("fillQuantity cannot exceed reserved order quantity");
  }

  const amountPerUnit = reservation.initialAmount / reservation.quantity;
  const requestedRelease = amountPerUnit * quantity;
  const release = Math.min(requestedRelease, reservation.remainingAmount);

  return Object.freeze({
    ...reservation,
    remainingAmount: reservation.remainingAmount - release,
  });
}

export function releaseRemainingOrderReservation(
  reservation: OrderBuyingPowerReservation,
): OrderBuyingPowerReservation {
  return Object.freeze({
    ...reservation,
    remainingAmount: 0,
  });
}

export function applyReservationRelease(
  buyingPower: BuyingPower,
  before: OrderBuyingPowerReservation,
  after: OrderBuyingPowerReservation,
): BuyingPower {
  const released = before.remainingAmount - after.remainingAmount;

  if (released < 0) {
    throw new Error("reservation release cannot increase reserved amount");
  }

  if (released === 0) return buyingPower;

  if (released > buyingPower.reservedCapacity) {
    throw new Error("reservation release exceeds reserved buying power");
  }

  return Object.freeze({
    ...buyingPower,
    reservedCapacity: buyingPower.reservedCapacity - released,
  });
}
