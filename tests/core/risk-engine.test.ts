import { describe, expect, it } from "vitest";
import {
  checkDailyLoss,
  checkNetExposure,
  createRiskPolicy,
  evaluateOrderAdmission,
  measureMetrics,
} from "../../core/domain/src/risk-engine.js";
import { createOrder } from "../../core/domain/src/order.js";
import type { InstrumentId } from "../../core/domain/src/instrument.js";

const order = createOrder({
  id: "ORD-RISK-1",
  accountId: "ACC-RISK",
  instrumentId: "AAPL" as InstrumentId,
  side: "buy",
  type: "limit",
  quantity: 10,
  limitPrice: 100,
  timeInForce: "day",
  createdAt: "2026-10-03T12:00:00.000Z",
});

function policy() {
  return createRiskPolicy({
    id: "POLICY-1",
    name: "default",
    accountId: "ACC-RISK",
    maxOrderNotional: 5_000,
    maxPositionNotional: 10_000,
    maxGrossExposure: 20_000,
    maxNetExposure: 15_000,
    maxDailyLoss: 1_000,
  });
}

function metrics(overrides: Partial<Parameters<typeof measureMetrics>[0]> = {}) {
  return measureMetrics({
    order,
    orderNotional: 1_000,
    projectedPositionNotional: 2_000,
    projectedGrossExposure: 4_000,
    projectedNetExposure: -4_000,
    dailyLoss: 100,
    reservedBuyingPower: 1_000,
    availableBuyingPower: 9_000,
    ...overrides,
  });
}

describe("risk engine", () => {
  it("evaluates negative net exposure using absolute magnitude", () => {
    expect(checkNetExposure(-14_000, policy())).toEqual({ allowed: true });
    expect(checkNetExposure(-15_001, policy())).toEqual({
      allowed: false,
      reason: "absolute net exposure exceeds configured limit",
    });
  });

  it("allows a loss below the configured daily-loss limit", () => {
    expect(checkDailyLoss(999, policy())).toEqual({ allowed: true });
    expect(checkDailyLoss(1_001, policy())).toEqual({
      allowed: false,
      reason: "daily loss exceeds configured limit",
    });
  });

  it("rejects an order belonging to another account", () => {
    const foreignOrder = createOrder({
      ...order,
      id: "ORD-RISK-FOREIGN",
      accountId: "ACC-OTHER",
    });

    const decision = evaluateOrderAdmission({
      order: foreignOrder,
      metrics: metrics(),
      policy: policy(),
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(
      "order account does not match risk policy account",
    );
  });

  it("rejects paused, draft, retired, and disabled policies", () => {
    for (const state of ["paused", "draft", "retired"] as const) {
      const decision = evaluateOrderAdmission({
        order,
        metrics: metrics(),
        policy: policyWith({ state }),
      });
      expect(decision.allowed).toBe(false);
    }

    const disabled = evaluateOrderAdmission({
      order,
      metrics: metrics(),
      policy: policyWith({ enabled: false }),
    });
    expect(disabled.allowed).toBe(false);
  });

  it("rejects when any deterministic limit is exceeded", () => {
    const decision = evaluateOrderAdmission({
      order,
      metrics: metrics({ orderNotional: 6_000 }),
      policy: policy(),
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(
      "order notional exceeds configured limit",
    );
  });

  it("rejects when order notional exceeds available buying power", () => {
    const decision = evaluateOrderAdmission({
      order,
      metrics: metrics({
        orderNotional: 4_000,
        availableBuyingPower: 3_000,
      }),
      policy: policy(),
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(
      "order notional exceeds available buying power",
    );
  });
});

function policyWith(
  overrides: Partial<Parameters<typeof createRiskPolicy>[0]>,
) {
  return createRiskPolicy({
    id: "POLICY-1",
    name: "default",
    accountId: "ACC-RISK",
    maxOrderNotional: 5_000,
    maxPositionNotional: 10_000,
    maxGrossExposure: 20_000,
    maxNetExposure: 15_000,
    maxDailyLoss: 1_000,
    ...overrides,
  });
}
