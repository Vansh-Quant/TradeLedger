/**
 * Deterministic buying-power capacity state.
 *
 * Buying power is modeled as available capacity rather than as a copy of
 * cash or equity. Total capacity is supplied by the applicable capacity
 * policy; reserved capacity represents commitments already consuming that
 * capacity. Broker-specific margin and leverage rules remain outside this
 * foundation.
 */

export interface BuyingPower {
  readonly totalCapacity: number;
  readonly reservedCapacity: number;
}

function requireFinite(value: number, field: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${field} must be finite`);
  }

  return value;
}

function requireNonNegative(value: number, field: string): number {
  requireFinite(value, field);

  if (value < 0) {
    throw new Error(`${field} must be non-negative`);
  }

  return value;
}

function requirePositive(value: number, field: string): number {
  requireFinite(value, field);

  if (value <= 0) {
    throw new Error(`${field} must be positive`);
  }

  return value;
}

function assertReservationWithinCapacity(
  totalCapacity: number,
  reservedCapacity: number,
): void {
  if (reservedCapacity > totalCapacity) {
    throw new Error("reservedCapacity cannot exceed totalCapacity");
  }
}

/**
 * Creates immutable buying-power state.
 *
 * Available buying power is intentionally derived rather than stored:
 *
 *   available = totalCapacity - reservedCapacity
 */
export function createBuyingPower(
  totalCapacity: number,
  reservedCapacity = 0,
): BuyingPower {
  const capacity = requireNonNegative(totalCapacity, "totalCapacity");
  const reserved = requireNonNegative(reservedCapacity, "reservedCapacity");

  assertReservationWithinCapacity(capacity, reserved);

  return Object.freeze({
    totalCapacity: capacity,
    reservedCapacity: reserved,
  });
}

export function calculateAvailableBuyingPower(buyingPower: BuyingPower): number {
  return buyingPower.totalCapacity - buyingPower.reservedCapacity;
}

export function reserveBuyingPower(buyingPower: BuyingPower, amount: number): BuyingPower {
  const reservation = requirePositive(amount, "amount");
  const available = calculateAvailableBuyingPower(buyingPower);

  if (reservation > available) {
    throw new Error("reservation amount exceeds available buying power");
  }

  return Object.freeze({
    ...buyingPower,
    reservedCapacity: buyingPower.reservedCapacity + reservation,
  });
}

export function releaseBuyingPower(buyingPower: BuyingPower, amount: number): BuyingPower {
  const release = requirePositive(amount, "amount");

  if (release > buyingPower.reservedCapacity) {
    throw new Error("release amount exceeds reserved buying power");
  }

  return Object.freeze({
    ...buyingPower,
    reservedCapacity: buyingPower.reservedCapacity - release,
  });
}
