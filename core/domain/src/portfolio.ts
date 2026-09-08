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
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${field} must be a positive finite number`);
}

function calculateActiveMetrics(positions: ReadonlyMap<string, Position>) {
  let marketValue = 0;
  let netExposure = 0;
  let grossExposure = 0;

  for (const position of positions.values()) {
    if (position.quantity === 0) continue;
    const value = position.quantity * (position.averagePrice ?? 0);
    marketValue += value;
    netExposure += value;
    grossExposure += Math.abs(value);
  }

  return { unrealizedPnl: 0, marketValue, netExposure, grossExposure };
}

export function createPortfolio(): Portfolio {
  const positions = new Map<string, Position>();
  return Object.freeze({ positions, realizedPnl: 0, ...calculateActiveMetrics(positions) });
}

export function setPosition(portfolio: Portfolio, position: Position): Portfolio {
  const positions = new Map(portfolio.positions);
  const previousPosition = positions.get(position.instrumentId);
  const previousRealizedPnl = previousPosition?.realizedPnl ?? 0;
  const realizedPnlDelta = position.realizedPnl - previousRealizedPnl;

  if (position.quantity === 0) positions.delete(position.instrumentId);
  else positions.set(position.instrumentId, position);

  return Object.freeze({
    positions,
    realizedPnl: portfolio.realizedPnl + realizedPnlDelta,
    ...calculateActiveMetrics(positions),
  });
}

export function getPosition(portfolio: Portfolio, instrumentId: string): Position | undefined {
  return portfolio.positions.get(instrumentId);
}

export function calculateUnrealizedPnl(position: Position, markPrice: number): number {
  assertPositiveFinite(markPrice, "markPrice");
  if (position.quantity === 0 || position.averagePrice === undefined) return 0;
  return position.quantity > 0
    ? (markPrice - position.averagePrice) * position.quantity
    : (position.averagePrice - markPrice) * Math.abs(position.quantity);
}

export function calculatePortfolioUnrealizedPnl(
  portfolio: Portfolio,
  markPrices: ReadonlyMap<string, number>,
): number {
  let unrealizedPnl = 0;
  for (const [instrumentId, position] of portfolio.positions) {
    const markPrice = markPrices.get(instrumentId);
    if (markPrice === undefined) throw new Error(`missing mark price for instrument ${instrumentId}`);
    unrealizedPnl += calculateUnrealizedPnl(position, markPrice);
  }
  return unrealizedPnl;
}
