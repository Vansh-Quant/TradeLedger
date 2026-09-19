/**
 * Basic deterministic risk boundaries.
 *
 * This foundation defines account/trading limits and pure checks against
 * measured values. It does not calculate broker margin, leverage, market
 * risk, VaR, strategy risk, or portfolio optimization.
 */

export interface RiskLimits {
  readonly maxOrderNotional: number;
  readonly maxPositionNotional: number;
  readonly maxGrossExposure: number;
  readonly maxNetExposure: number;
  readonly maxDailyLoss: number;
}

export interface RiskCheckResult {
  readonly allowed: boolean;
  readonly reason?: string;
}

function requirePositiveFinite(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} must be a positive finite number`);
  }
  return value;
}

export function createRiskLimits(input: RiskLimits): RiskLimits {
  const limits = {
    maxOrderNotional: requirePositiveFinite(input.maxOrderNotional, "maxOrderNotional"),
    maxPositionNotional: requirePositiveFinite(input.maxPositionNotional, "maxPositionNotional"),
    maxGrossExposure: requirePositiveFinite(input.maxGrossExposure, "maxGrossExposure"),
    maxNetExposure: requirePositiveFinite(input.maxNetExposure, "maxNetExposure"),
    maxDailyLoss: requirePositiveFinite(input.maxDailyLoss, "maxDailyLoss"),
  };

  return Object.freeze(limits);
}

function checkLimit(
  value: number,
  limit: number,
  label: string,
): RiskCheckResult {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number`);
  }

  return value <= limit
    ? { allowed: true }
    : { allowed: false, reason: `${label} exceeds configured limit` };
}

export function checkOrderNotional(
  notional: number,
  limits: RiskLimits,
): RiskCheckResult {
  return checkLimit(notional, limits.maxOrderNotional, "order notional");
}

export function checkPositionNotional(
  notional: number,
  limits: RiskLimits,
): RiskCheckResult {
  return checkLimit(notional, limits.maxPositionNotional, "position notional");
}

export function checkGrossExposure(
  grossExposure: number,
  limits: RiskLimits,
): RiskCheckResult {
  return checkLimit(grossExposure, limits.maxGrossExposure, "gross exposure");
}

export function checkNetExposure(
  netExposure: number,
  limits: RiskLimits,
): RiskCheckResult {
  return checkLimit(Math.abs(netExposure), limits.maxNetExposure, "net exposure");
}

export function checkDailyLoss(
  dailyLoss: number,
  limits: RiskLimits,
): RiskCheckResult {
  return checkLimit(dailyLoss, limits.maxDailyLoss, "daily loss");
}
