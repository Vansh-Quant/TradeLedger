/**
 * Portfolio aggregate for active position state.
 *
 * Portfolio owns one active Position per instrument and derives aggregate
 * exposure and P&L metrics from those positions. Valuation is intentionally
 * simple in v0.1; instrument-specific pricing belongs to later layers.
 */

import type { Position } from "./position.js";

export interface Portfolio {
  readonly positions: ReadonlyMap<string, Position>;
  readonly realizedPnl: number;
  readonly unrealizedPnl: number;
  readonly marketValue: number;
  readonly netExposure: number;
  readonly grossExposure: number;
}

function assertPositiveFinite(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} must be a positive finite number`);
  }
}

function calculateMetrics(positions: ReadonlyMap<string, Position>): Omit<Portfolio, "positions"> {
  let realizedPnl = 0;
  let unrealizedPnl = 0;
  let marketValue = 0;
  let netExposure = 0;
  let grossExposure = 0;

  for (const position of positions.values()) {
    realizedPnl += position.realizedPnl;

    if (position.quantity === 0) continue;

    const marketValueForPosition = position.quantity * (position.averagePrice ?? 0);
    marketValue += marketValueForPosition;
    netExposure += marketValueForPosition;
    grossExposure += Math.abs(marketValueForPosition);
  }

  return {
    realizedPnl,
    // v0.1 has no external mark-price input, so unrealized P&L is zero until
    // a valuation/market-data layer supplies current prices.
    unrealizedPnl,
    marketValue,
    netExposure,
    grossExposure,
  };
}

export function createPortfolio(): Portfolio {
  const positions = new Map<string, Position>();

  return Object.freeze({
    positions,
    ...calculateMetrics(positions),
  });
}

/**
 * Adds or replaces an active position in the portfolio.
 * Flat positions are removed from the active collection.
 */
export function setPosition(portfolio: Portfolio, position: Position): Portfolio {
  const positions = new Map(portfolio.positions);

  if (position.quantity === 0) {
    positions.delete(position.instrumentId);
  } else {
    positions.set(position.instrumentId, position);
  }

  return Object.freeze({
    positions,
    ...calculateMetrics(positions),
  });
}

/**
 * Returns the active position for an instrument, if one exists.
 */
export function getPosition(
  portfolio: Portfolio,
  instrumentId: string,
): Position | undefined {
  return portfolio.positions.get(instrumentId);
}

/**
 * Calculates unrealized P&L for a position at a supplied mark price.
 */
export function calculateUnrealizedPnl(
  position: Position,
  markPrice: number,
): number {
  assertPositiveFinite(markPrice, "markPrice");

  if (position.quantity === 0 || position.averagePrice === undefined) {
    return 0;
  }

  return position.quantity > 0
    ? (markPrice - position.averagePrice) * position.quantity
    : (position.averagePrice - markPrice) * Math.abs(position.quantity);
}

/**
 * Calculates aggregate unrealized P&L from current mark prices.
 * Every active portfolio position must have a supplied mark price.
 */
export function calculatePortfolioUnrealizedPnl(
  portfolio: Portfolio,
  markPrices: ReadonlyMap<string, number>,
): number {
  let unrealizedPnl = 0;

  for (const [instrumentId, position] of portfolio.positions) {
    const markPrice = markPrices.get(instrumentId);
    if (markPrice === undefined) {
      throw new Error(`missing mark price for instrument ${instrumentId}`);
    }

    unrealizedPnl += calculateUnrealizedPnl(position, markPrice);
  }

  return unrealizedPnl;
}
