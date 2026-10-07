import type { Portfolio } from "./portfolio.js";

export interface PortfolioValuation {
  readonly marketValue: number;
  readonly netExposure: number;
  readonly grossExposure: number;
  readonly unrealizedPnl: number;
}

function requirePositiveFinite(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(field + " must be a positive finite number");
  }
  return value;
}

export function calculatePortfolioValuation(
  portfolio: Portfolio,
  markPrices: ReadonlyMap<string, number>,
): PortfolioValuation {
  let marketValue = 0;
  let netExposure = 0;
  let grossExposure = 0;
  let unrealizedPnl = 0;

  for (const [instrumentId, position] of portfolio.positions) {
    if (position.quantity === 0) continue;

    const mark = requirePositiveFinite(
      markPrices.get(instrumentId) ?? Number.NaN,
      "markPrice for " + instrumentId,
    );

    const value = position.quantity * mark;
    marketValue += value;
    netExposure += value;
    grossExposure += Math.abs(value);

    if (position.averagePrice === undefined) {
      throw new Error("non-flat position must have an averagePrice");
    }

    unrealizedPnl +=
      position.quantity > 0
        ? (mark - position.averagePrice) * position.quantity
        : (position.averagePrice - mark) * Math.abs(position.quantity);
  }

  return Object.freeze({
    marketValue,
    netExposure,
    grossExposure,
    unrealizedPnl,
  });
}
