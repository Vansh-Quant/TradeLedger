/**
 * Centralized deterministic risk policy and evaluation.
 *
 * This module only encodes configurable limits and deterministic
 * pass/fail comparisons. It does not calculate broker margin, leverage,
 * market risk, VaR, strategy risk, or portfolio optimization.
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
  readonly policyId?: string;
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
  policyId?: string,
): RiskCheckResult {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number`);
  }

  const result: RiskCheckResult = value <= limit
    ? { allowed: true }
    : { allowed: false, reason: `${label} exceeds configured limit` };

  if (policyId) {
    return { ...result, policyId };
  }

  return result;
}

export function checkOrderNotional(
  notional: number,
  limits: RiskLimits,
  policyId?: string,
): RiskCheckResult {
  return checkLimit(notional, limits.maxOrderNotional, "order notional", policyId);
}

export function checkPositionNotional(
  notional: number,
  limits: RiskLimits,
  policyId?: string,
): RiskCheckResult {
  return checkLimit(notional, limits.maxPositionNotional, "position notional", policyId);
}

export function checkGrossExposure(
  exposure: number,
  limits: RiskLimits,
  policyId?: string,
): RiskCheckResult {
  return checkLimit(exposure, limits.maxGrossExposure, "gross exposure", policyId);
}

export function checkNetExposure(
  exposure: number,
  limits: RiskLimits,
  policyId?: string,
): RiskCheckResult {
  const absolute = Math.abs(exposure);
  return checkLimit(absolute, limits.maxNetExposure, "net exposure", policyId);
}

export function checkDailyLoss(
  loss: number,
  limits: RiskLimits,
  policyId?: string,
): RiskCheckResult {
  return checkLimit(loss, limits.maxDailyLoss, "daily loss", policyId);
}
