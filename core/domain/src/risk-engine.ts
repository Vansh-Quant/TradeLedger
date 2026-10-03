/**
 * Centralized deterministic risk engine for TradeLedger.
 *
 * Provides configurable risk policies and deterministic evaluation for order
 * admission. All risk decisions are pure functions of inputs and immutable
 * policies; no AI or agent input can alter the result.
 */

import type { Account } from "./account.js";
import type { Position } from "./position.js";
import type { Portfolio } from "./portfolio.js";
import type { Order } from "./order.js";
import type { OrderSide } from "./order.js";
import type { RiskCheckResult, RiskLimits } from "./risk-boundary.js";

export const RISK_POLICY_STATES = [
  "draft",
  "active",
  "paused",
  "retired",
] as const;
export type RiskPolicyState = (typeof RISK_POLICY_STATES)[number];

export interface RiskPolicy {
  readonly id: string;
  readonly name: string;
  readonly accountId: string;
  readonly maxOrderNotional: number;
  readonly maxPositionNotional: number;
  readonly maxGrossExposure: number;
  readonly maxNetExposure: number;
  readonly maxDailyLoss: number;
  readonly enabled: boolean;
  readonly state: RiskPolicyState;
}

export interface RiskDecision {
  readonly allowed: boolean;
  readonly reason?: string;
  readonly policyId: string;
  readonly policyName: string;
  readonly measured: RiskMetrics;
}

export interface RiskMetrics {
  readonly orderNotional: number;
  readonly projectedPositionNotional: number;
  readonly projectedGrossExposure: number;
  readonly projectedNetExposure: number;
  readonly dailyLoss: number;
  readonly reservedBuyingPower: number;
  readonly availableBuyingPower: number;
  readonly accountIds: readonly string[];
}

function requireNonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`${field} must not be empty`);
  }
  return normalized;
}

function requirePositive(value: number, field: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${field} must be finite`);
  }
  if (value <= 0) {
    throw new Error(`${field} must be positive`);
  }
  return value;
}

function requireNonNegative(value: number, field: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${field} must be finite`);
  }
  if (value < 0) {
    throw new Error(`${field} must be non-negative`);
  }
  return value;
}

function createPolicyId(): string {
  return crypto.randomUUID();
}

export function createRiskPolicy(input: {
  readonly id?: string;
  readonly name: string;
  readonly accountId: string;
  readonly maxOrderNotional: number;
  readonly maxPositionNotional: number;
  readonly maxGrossExposure: number;
  readonly maxNetExposure: number;
  readonly maxDailyLoss: number;
  readonly enabled?: boolean;
  readonly state?: RiskPolicyState;
}): RiskPolicy {
  const id = input.id ?? createPolicyId();
  const name = requireNonEmpty(input.name, "name");
  const accountId = requireNonEmpty(input.accountId, "accountId");
  const maxOrderNotional = requirePositive(input.maxOrderNotional, "maxOrderNotional");
  const maxPositionNotional = requirePositive(input.maxPositionNotional, "maxPositionNotional");
  const maxGrossExposure = requirePositive(input.maxGrossExposure, "maxGrossExposure");
  const maxNetExposure = requirePositive(input.maxNetExposure, "maxNetExposure");
  const maxDailyLoss = requirePositive(input.maxDailyLoss, "maxDailyLoss");

  return Object.freeze({
    id,
    name,
    accountId,
    maxOrderNotional,
    maxPositionNotional,
    maxGrossExposure,
    maxNetExposure,
    maxDailyLoss,
    enabled: input.enabled ?? true,
    state: input.state ?? "active",
  });
}

function validatePolicy(policy: RiskPolicy): void {
  if (policy.maxOrderNotional <= 0) throw new Error("maxOrderNotional must be positive");
  if (policy.maxPositionNotional <= 0) throw new Error("maxPositionNotional must be positive");
  if (policy.maxGrossExposure <= 0) throw new Error("maxGrossExposure must be positive");
  if (policy.maxNetExposure <= 0) throw new Error("maxNetExposure must be positive");
  if (policy.maxDailyLoss <= 0) throw new Error("maxDailyLoss must be positive");
}

function checkMetric(
  value: number,
  limit: number,
  label: string,
  policyId: string,
): RiskCheckResult {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  if (value < 0) {
    throw new Error(`${label} must be non-negative`);
  }
  if (value > limit) {
    return { allowed: false, reason: "${label} exceeds configured limit" };
  }
  return { allowed: true };
}

export function checkOrderNotional(
  notional: number,
  policy: RiskPolicy,
): RiskCheckResult {
  validatePolicy(policy);
  return checkMetric(notional, policy.maxOrderNotional, "order notional", policy.id);
}

export function checkPositionNotional(
  notional: number,
  policy: RiskPolicy,
): RiskCheckResult {
  validatePolicy(policy);
  return checkMetric(notional, policy.maxPositionNotional, "position notional", policy.id);
}

export function checkGrossExposure(
  grossExposure: number,
  policy: RiskPolicy,
): RiskCheckResult {
  validatePolicy(policy);
  return checkMetric(grossExposure, policy.maxGrossExposure, "gross exposure", policy.id);
}

export function checkNetExposure(
  netExposure: number,
  policy: RiskPolicy,
): RiskCheckResult {
  validatePolicy(policy);
  return checkMetric(Math.abs(netExposure), policy.maxNetExposure, "net exposure", policy.id);
}

export function checkDailyLoss(
  dailyLoss: number,
  policy: RiskPolicy,
): RiskCheckResult {
  validatePolicy(policy);
  return checkMetric(dailyLoss, policy.maxDailyLoss, "daily loss", policy.id);
}

export function checkReservedBuyingPower(
  reserved: number,
  policy: RiskPolicy,
): RiskCheckResult {
  validatePolicy(policy);
  if (policy.maxOrderNotional < reserved) {
    return {
      allowed: false,
      reason: "reserved buying power exceeds configured order limit",
      policyId: policy.id,
    };
  }
  return { allowed: true, policyId: policy.id };
}

export function measureMetrics(input: {
  readonly order?: Order;
  readonly side?: OrderSide;
  readonly orderNotional: number;
  readonly projectedPositionNotional: number;
  readonly projectedGrossExposure: number;
  readonly projectedNetExposure: number;
  readonly dailyLoss: number;
  readonly reservedBuyingPower: number;
  readonly availableBuyingPower: number;
  readonly positions?: readonly Position[];
  readonly portfolio?: Portfolio;
  readonly accountIds?: readonly string[];
}): RiskMetrics {
  const order = input.order;
  const side = input.side;
  if (order !== undefined && side !== undefined && order.id !== undefined && order.quantity > 0) {
    if (side === "buy" && order.quantity < 0 || side === "sell" && order.quantity > 0) {
      throw new Error("side does not match order quantity");
    }
  }
  if (input.orderNotional < 0 || input.projectedPositionNotional < 0) {
    throw new Error("notional metrics must be non-negative");
  }

  const positions = input.positions ?? [];
  let grossExposure = 0;
  let netExposure = 0;

  for (const position of positions) {
    if (position.side !== "long" && position.side !== "short" && position.side !== "flat") {
      throw new Error("position.side must be long, short, or flat");
    }
    const value = position.quantity * (position.averagePrice ?? 0);
    grossExposure += Math.abs(value);
    netExposure += value;
  }

  const accountIds = input.accountIds ?? [];

  return Object.freeze({
    orderNotional: requireNonNegative(input.orderNotional, "orderNotional"),
    projectedPositionNotional: requireNonNegative(input.projectedPositionNotional, "projectedPositionNotional"),
    projectedGrossExposure: requireNonNegative(input.projectedGrossExposure, "projectedGrossExposure"),
    projectedNetExposure: requireNonNegative(input.projectedNetExposure, "projectedNetExposure"),
    dailyLoss: requireNonNegative(input.dailyLoss, "dailyLoss"),
    reservedBuyingPower: requireNonNegative(input.reservedBuyingPower, "reservedBuyingPower"),
    availableBuyingPower: requireNonNegative(input.availableBuyingPower, "availableBuyingPower"),
    accountIds,
  });
}

export function evaluateOrderAdmission(input: {
  readonly order: Order;
  readonly metrics: RiskMetrics;
  readonly policy: RiskPolicy;
}): RiskDecision {
  const policy = input.policy;
  if (!policy.enabled) {
    return { allowed: true, policyId: policy.id, policyName: policy.name, measured: input.metrics };
  }

  const { order, metrics } = input;
  const checks: readonly [RiskCheckResult, string][] = [
    [checkOrderNotional(metrics.orderNotional, policy), "order notional"],
    [checkPositionNotional(metrics.projectedPositionNotional, policy), "projected position notional"],
    [checkGrossExposure(metrics.projectedGrossExposure, policy), "projected gross exposure"],
    [checkNetExposure(metrics.projectedNetExposure, policy), "projected net exposure"],
    [checkDailyLoss(metrics.dailyLoss, policy), "daily loss"],
    [checkReservedBuyingPower(metrics.reservedBuyingPower, policy), "reserved buying power"],
  ];

  const riskFailure = checks.find(([result]) => !result.allowed);
  if (riskFailure) {
    const [, label] = riskFailure;
    return { allowed: false, reason: label, policyId: policy.id, policyName: policy.name, measured: metrics };
  }

  return {
    allowed: true,
    policyId: policy.id,
    policyName: policy.name,
    measured: metrics,
  };
}
