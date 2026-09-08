/**
 * Position state derived from executed fills.
 *
 * A Position represents the current state for one instrument. Orders are
 * intentions; fills are execution events; positions are the resulting state.
 *
 * The first implementation intentionally excludes fees, financing, margin,
 * leverage, and instrument-specific valuation. Those belong to later layers.
 */

export const POSITION_SIDES = ["long", "short", "flat"] as const;
export type PositionSide = (typeof POSITION_SIDES)[number];

export interface FillInput {
  quantity: number;
  price: number;
}

export interface Position {
  readonly instrumentId: string;
  readonly quantity: number;
  readonly averagePrice: number | undefined;
  readonly realizedPnl: number;
  readonly side: PositionSide;
}

function assertPositiveFinite(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} must be a positive finite number`);
  }
}

function assertInstrumentId(instrumentId: string): void {
  if (instrumentId.trim().length === 0) {
    throw new Error("instrumentId must not be empty");
  }
}

function sideFromQuantity(quantity: number): PositionSide {
  if (quantity > 0) return "long";
  if (quantity < 0) return "short";
  return "flat";
}

/**
 * Creates an empty position for an instrument.
 */
export function createPosition(instrumentId: string): Position {
  assertInstrumentId(instrumentId);

  return Object.freeze({
    instrumentId,
    quantity: 0,
    averagePrice: undefined,
    realizedPnl: 0,
    side: "flat" as const,
  });
}

/**
 * Applies a buy/sell fill to an existing position.
 *
 * Quantity is signed internally: buy adds quantity, sell subtracts quantity.
 * Opposite-side fills first close the existing position. Any excess quantity
 * opens a reversal at the fill price.
 */
export function applyFill(
  position: Position,
  side: "buy" | "sell",
  fill: FillInput,
): Position {
  assertPositiveFinite(fill.quantity, "fill.quantity");
  assertPositiveFinite(fill.price, "fill.price");

  const signedFill = side === "buy" ? fill.quantity : -fill.quantity;
  const oldQuantity = position.quantity;
  const newQuantity = oldQuantity + signedFill;

  // Flat -> new position, or same-side increase.
  if (oldQuantity === 0 || Math.sign(oldQuantity) === Math.sign(signedFill)) {
    const oldAverage = position.averagePrice ?? 0;
    const oldAbsQuantity = Math.abs(oldQuantity);
    const newAbsQuantity = Math.abs(newQuantity);
    const averagePrice =
      newAbsQuantity === 0
        ? undefined
        : (oldAbsQuantity * oldAverage + fill.quantity * fill.price) /
          newAbsQuantity;

    return Object.freeze({
      instrumentId: position.instrumentId,
      quantity: newQuantity,
      averagePrice,
      realizedPnl: position.realizedPnl,
      side: sideFromQuantity(newQuantity),
    });
  }

  // Opposite-side fill: close some or all of the existing position.
  const closingQuantity = Math.min(Math.abs(oldQuantity), fill.quantity);
  const oldAverage = position.averagePrice;

  if (oldAverage === undefined) {
    throw new Error("non-flat position must have an averagePrice");
  }

  const realizedPnl =
    position.realizedPnl +
    (oldQuantity > 0
      ? (fill.price - oldAverage) * closingQuantity
      : (oldAverage - fill.price) * closingQuantity);

  // Exact close.
  if (newQuantity === 0) {
    return Object.freeze({
      instrumentId: position.instrumentId,
      quantity: 0,
      averagePrice: undefined,
      realizedPnl,
      side: "flat" as const,
    });
  }

  // Partial close: remaining position keeps its original average.
  if (Math.sign(oldQuantity) === Math.sign(newQuantity)) {
    return Object.freeze({
      instrumentId: position.instrumentId,
      quantity: newQuantity,
      averagePrice: oldAverage,
      realizedPnl,
      side: sideFromQuantity(newQuantity),
    });
  }

  // Reversal: the excess fill opens a new position at the fill price.
  return Object.freeze({
    instrumentId: position.instrumentId,
    quantity: newQuantity,
    averagePrice: fill.price,
    realizedPnl,
    side: sideFromQuantity(newQuantity),
  });
}
