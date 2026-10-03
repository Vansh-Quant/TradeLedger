/**
 * Centralized deterministic risk engine for TradeLedger.
 *
 * Risk decisions are pure functions of measured inputs and immutable policies.
 * AI, agents, and application layers may request actions but cannot override
 * this boundary.
 */

import type { Order, OrderSide } from "./order.js";
import type { Position } from "./position.js";
import type { Portfolio } from "./portfolio.js";
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
  const policy: RiskPolicy = {
    id: requireNonEmpty(input.id ?? createPolicyId(), "id"),
    name: requireNonEmpty(input.name, "name"),
    accountId: requireNonEmpty(input.accountId, "accountId"),
    maxOrderNotional: requirePositive(
      input.maxOrderNotional,
      "maxOrderNotional",
    ),
    maxPositionNotional: requirePositive(
      input.maxPositionNotional,
      "maxPositionNotional",
    ),
    maxGrossExposure: requirePositive(
      input.maxGrossExposure,
      "maxGrossExposure",
    ),
    maxNetExposure: requirePositive(input.maxNetExposure, "maxNetExposure"),
    maxDailyLoss: requirePositive(input.maxDailyLoss, "maxDailyLoss"),
    enabled: input.enabled ?? true,
    state: input.state ?? "active",
  };

  return Object.freeze(policy);
}

function validatePolicy(policy: RiskPolicy): void {
  requireNonEmpty(policy.id, "policy.id");
  requireNonEmpty(policy.name, "policy.name");
  requireNonEmpty(policy.accountId, "policy.accountId");
  requirePositive(policy.maxOrderNotional, "maxOrderNotional");
  requirePositive(policy.maxPositionNotional, "maxPositionNotional");
  requirePositive(policy.maxGrossExposure, "maxGrossExposure");
  requirePositive(policy.maxNetExposure, "maxNetExposure");
  requirePositive(policy.maxDailyLoss, "maxDailyLoss");

  if (!RISK_POLICY_STATES.includes(policy.state)) {
    throw new Error("policy.state is invalid");
  }
}

function checkMetric(
  value: number,
  limit: number,
  label: string,
): RiskCheckResult {
  requireNonNegative(value, label);
  if (value > limit) {
    return {
      allowed: false,
      reason: `${label} exceeds configured limit`,
    };
  }
  return { allowed: true };
}

export function checkOrderNotional(
  notional: number,
  policy: RiskPolicy,
): RiskCheckResult {
  validatePolicy(policy);
  return checkMetric(notional, policy.maxOrderNotional, "order notional");
}

export function checkPositionNotional(
  notional: number,
  policy: RiskPolicy,
): RiskCheckResult {
  validatePolicy(policy);
  return checkMetric(
    notional,
    policy.maxPositionNotional,
    "position notional",
  );
}

export function checkGrossExposure(
  grossExposure: number,
  policy: RiskPolicy,
): RiskCheckResult {
  validatePolicy(policy);
  return checkMetric(
    grossExposure,
    policy.maxGrossExposure,
    "gross exposure",
  );
}

export function checkNetExposure(
  netExposure: number,
  policy: RiskPolicy,
): RiskCheckResult {
  validatePolicy(policy);
  requireFinite(netExposure, "net exposure");
  return checkMetric(
    Math.abs(netExposure),
    policy.maxNetExposure,
    "absolute net exposure",
  );
}

export function checkDailyLoss(
  dailyLoss: number,
  policy: RiskPolicy,
): RiskCheckResult {
  validatePolicy(policy);
  return checkMetric(dailyLoss, policy.maxDailyLoss, "daily loss");
}

export function checkReservedBuyingPower(
  reserved: number,
  policy: RiskPolicy,
): RiskCheckResult {
  validatePolicy(policy);
  return checkMetric(
    reserved,
    policy.maxOrderNotional,
    "reserved buying power",
  );
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

  if (
    order !== undefined &&
    side !== undefined &&
    side !== order.side
  ) {
    throw new Error("side does not match order side");
  }

  const positions = input.positions ?? [];
  for (const position of positions) {
    if (
      position.side !== "long" &&
      position.side !== "short" &&
      position.side !== "flat"
    ) {
      throw new Error("position.side must be long, short, or flat");
    }
  }

  const projectedNetExposure = requireFinite(
    input.projectedNetExposure,
    "projectedNetExposure",
  );

  return Object.freeze({
    orderNotional: requireNonNegative(input.orderNotional, "orderNotional"),
    projectedPositionNotional: requireNonNegative(
      input.projectedPositionNotional,
      "projectedPositionNotional",
    ),
    projectedGrossExposure: requireNonNegative(
      input.projectedGrossExposure,
      "projectedGrossExposure",
    ),
    projectedNetExposure,
    dailyLoss: requireNonNegative(input.dailyLoss, "dailyLoss"),
    reservedBuyingPower: requireNonNegative(
      input.reservedBuyingPower,
      "reservedBuyingPower",
    ),
    availableBuyingPower: requireNonNegative(
      input.availableBuyingPower,
      "availableBuyingPower",
    ),
    accountIds: Object.freeze([...(input.accountIds ?? [])]),
  });
}

export function evaluateOrderAdmission(input: {
  readonly order: Order;
  readonly metrics: RiskMetrics;
  readonly policy: RiskPolicy;
}): RiskDecision {
  const { order, metrics, policy } = input;
  validatePolicy(policy);

  if (order.accountId !== policy.accountId) {
    return {
      allowed: false,
      reason: "order account does not match risk policy account",
      policyId: policy.id,
      policyName: policy.name,
      measured: metrics,
    };
  }

  if (!policy.enabled || policy.state === "draft" || policy.state === "retired") {
    return {
      allowed: false,
      reason: "risk policy is not active",
      policyId: policy.id,
      policyName: policy.name,
      measured: metrics,
    };
  }

  if (policy.state === "paused") {
    return {
      allowed: false,
      reason: "risk policy is paused",
      policyId: policy.id,
      policyName: policy.name,
      measured: metrics,
    };
  }

  const checks: readonly [RiskCheckResult, string][] = [
    [checkOrderNotional(metrics.orderNotional, policy), "order notional"],
    [
      checkPositionNotional(
        metrics.projectedPositionNotional,
        policy,
      ),
      "projected position notional",
    ],
    [
      checkGrossExposure(metrics.projectedGrossExposure, policy),
      "projected gross exposure",
    ],
    [
      checkNetExposure(metrics.projectedNetExposure, policy),
      "absolute net exposure",
    ],
    [checkDailyLoss(metrics.dailyLoss, policy), "daily loss"],
    [
      checkReservedBuyingPower(metrics.reservedBuyingPower, policy),
      "reserved buying power",
    ],
  ];

  const failure = checks.find(([result]) => !result.allowed);
  if (failure) {
    const [result, label] = failure;
    return {
      allowed: false,
      reason: result.reason ?? label,
      policyId: policy.id,
      policyName: policy.name,
      measured: metrics,
    };
  }

  if (metrics.orderNotional > metrics.availableBuyingPower) {
    return {
      allowed: false,
      reason: "order notional exceeds available buying power",
      policyId: policy.id,
      policyName: policy.name,
      measured: metrics,
    };
  }

  return {
    allowed: true,
    policyId: policy.id,
    policyName: policy.name,
    measured: metrics,
  };
}
