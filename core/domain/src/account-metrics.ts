import type { BuyingPower } from "./buying-power.js";
import { calculateAvailableBuyingPower } from "./buying-power.js";
import type { CashBalance } from "./cash.js";
import type { PortfolioValuation } from "./portfolio-valuation.js";

export interface AccountMetrics {
  readonly cash: number;
  readonly marketValue: number;
  readonly unrealizedPnl: number;
  readonly realizedPnl: number;
  readonly totalEquity: number;
  readonly grossExposure: number;
  readonly netExposure: number;
  readonly reservedBuyingPower: number;
  readonly availableBuyingPower: number;
}

function requireFinite(value: number, field: string): number {
  if (!Number.isFinite(value)) throw new Error(field + " must be finite");
  return value;
}

export function calculateAccountMetrics(
  cashBalance: CashBalance,
  valuation: PortfolioValuation,
  realizedPnl: number,
  buyingPower?: BuyingPower,
): AccountMetrics {
  const cash = requireFinite(cashBalance.amount, "cashBalance.amount");
  const realized = requireFinite(realizedPnl, "realizedPnl");
  const totalEquity = cash + valuation.unrealizedPnl;

  return Object.freeze({
    cash,
    marketValue: valuation.marketValue,
    unrealizedPnl: valuation.unrealizedPnl,
    realizedPnl: realized,
    totalEquity,
    grossExposure: valuation.grossExposure,
    netExposure: valuation.netExposure,
    reservedBuyingPower: buyingPower?.reservedCapacity ?? 0,
    availableBuyingPower:
      buyingPower === undefined
        ? cash
        : calculateAvailableBuyingPower(buyingPower),
  });
}
