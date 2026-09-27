import type { BuyingPower } from "./buying-power.js";
import { calculateAvailableBuyingPower, reserveBuyingPower } from "./buying-power.js";
import { checkDailyLoss, checkGrossExposure, checkNetExposure, checkOrderNotional, checkPositionNotional, type RiskCheckResult, type RiskLimits } from "./risk-boundary.js";
import type { Order } from "./order.js";

export interface OrderAdmissionInput {
  readonly order: Order;
  readonly orderNotional: number;
  readonly projectedPositionNotional: number;
  readonly projectedGrossExposure: number;
  readonly projectedNetExposure: number;
  readonly dailyLoss: number;
  readonly buyingPower: BuyingPower;
  readonly riskLimits: RiskLimits;
}

export interface OrderAdmissionResult {
  readonly admitted: boolean;
  readonly reason?: string;
  readonly buyingPower: BuyingPower;
}

function reject(reason: string, buyingPower: BuyingPower): OrderAdmissionResult {
  return Object.freeze({ admitted: false, reason, buyingPower });
}

function firstRejected(checks: readonly [RiskCheckResult, string][]): string | undefined {
  for (const [result, label] of checks) {
    if (!result.allowed) return result.reason ?? label;
  }
  return undefined;
}

/**
 * Deterministic pre-admission gate. The caller supplies the applicable
 * order notional and projected account metrics; this workflow does not
 * invent market prices or calculate advanced risk metrics.
 */
export function admitOrder(input: OrderAdmissionInput): OrderAdmissionResult {
  if (!Number.isFinite(input.orderNotional) || input.orderNotional <= 0) {
    throw new Error("orderNotional must be a positive finite number");
  }

  const checks: readonly [RiskCheckResult, string][] = [
    [checkOrderNotional(input.orderNotional, input.riskLimits), "order notional rejected"],
    [checkPositionNotional(input.projectedPositionNotional, input.riskLimits), "projected position notional rejected"],
    [checkGrossExposure(input.projectedGrossExposure, input.riskLimits), "projected gross exposure rejected"],
    [checkNetExposure(input.projectedNetExposure, input.riskLimits), "projected net exposure rejected"],
    [checkDailyLoss(input.dailyLoss, input.riskLimits), "daily loss rejected"],
  ];

  const riskFailure = firstRejected(checks);
  if (riskFailure !== undefined) return reject(riskFailure, input.buyingPower);

  if (calculateAvailableBuyingPower(input.buyingPower) < input.orderNotional) {
    return reject("order notional exceeds available buying power", input.buyingPower);
  }

  return Object.freeze({
    admitted: true,
    buyingPower: reserveBuyingPower(input.buyingPower, input.orderNotional),
  });
}
