import type { AccountPortfolio } from "./account-portfolio.js";
import type { BuyingPower } from "./buying-power.js";
import { admitOrder, type OrderAdmissionInput } from "./order-admission.js";
import { transitionOrder } from "./order-lifecycle.js";
import type { Execution } from "./execution.js";
import type { ExecutionEventStore } from "./execution-event-store.js";
import {
  createExecutionReconciliation,
  type ExecutionReconciliation,
} from "./execution-reconciliation.js";
import { processExecution } from "./execution-processing.js";
import type { Order } from "./order.js";
import type { RiskLimits } from "./risk-boundary.js";

export interface TradingCoreState {
  readonly order: Order;
  readonly buyingPower: BuyingPower;
  readonly reconciliation: ExecutionReconciliation;
}

export interface TradingCoreAdmissionInput {
  readonly order: Order;
  readonly accountPortfolio: AccountPortfolio;
  readonly buyingPower: BuyingPower;
  readonly riskLimits: RiskLimits;
  readonly orderNotional: number;
  readonly projectedPositionNotional: number;
  readonly projectedGrossExposure: number;
  readonly projectedNetExposure: number;
  readonly dailyLoss: number;
}

export interface TradingCoreAdmissionResult {
  readonly admitted: boolean;
  readonly reason?: string;
  readonly state: TradingCoreState;
}

export interface TradingCoreExecutionInput {
  readonly state: TradingCoreState;
  readonly execution: Execution;
  readonly eventStore: ExecutionEventStore;
  readonly eventId: string;
  readonly recordedAt: string;
}

export interface TradingCoreExecutionResult {
  readonly state: TradingCoreState;
  readonly applied: boolean;
  readonly duplicate: boolean;
}

/**
 * Composes the existing deterministic admission and lifecycle boundaries into
 * one trading-core entry point.
 *
 * Admission is responsible for risk and buying-power reservation. Lifecycle
 * transitions then move the order through submission and acknowledgement.
 * Execution processing remains the source of truth for actual fills.
 *
 * Buying-power release after fills/cancellation is intentionally deferred to
 * the later reservation/settlement workflow; this state therefore preserves
 * the admission reservation.
 */
export function admitTradingOrder(
  input: TradingCoreAdmissionInput,
): TradingCoreAdmissionResult {
  const admissionInput: OrderAdmissionInput = {
    order: input.order,
    orderNotional: input.orderNotional,
    projectedPositionNotional: input.projectedPositionNotional,
    projectedGrossExposure: input.projectedGrossExposure,
    projectedNetExposure: input.projectedNetExposure,
    dailyLoss: input.dailyLoss,
    buyingPower: input.buyingPower,
    riskLimits: input.riskLimits,
  };

  const admission = admitOrder(admissionInput);

  if (!admission.admitted) {
    const rejectedOrder = transitionOrder(input.order, "rejected");
    const reconciliation = createExecutionReconciliation(
      rejectedOrder,
      input.accountPortfolio,
    );

    return Object.freeze({
      admitted: false,
      ...(admission.reason === undefined ? {} : { reason: admission.reason }),
      state: Object.freeze({
        order: rejectedOrder,
        buyingPower: admission.buyingPower,
        reconciliation,
      }),
    });
  }

  const submitted = transitionOrder(input.order, "submitted");
  const acknowledged = transitionOrder(submitted, "acknowledged");
  const reconciliation = createExecutionReconciliation(
    acknowledged,
    input.accountPortfolio,
  );

  return Object.freeze({
    admitted: true,
    state: Object.freeze({
      order: acknowledged,
      buyingPower: admission.buyingPower,
      reconciliation,
    }),
  });
}

/**
 * Applies an actual execution through the canonical execution-processing
 * workflow and mirrors the resulting reconciliation state into the trading
 * core state.
 */
export function processTradingExecution(
  input: TradingCoreExecutionInput,
): TradingCoreExecutionResult {
  const result = processExecution({
    state: input.state.reconciliation,
    execution: input.execution,
    eventStore: input.eventStore,
    eventId: input.eventId,
    recordedAt: input.recordedAt,
  });

  return Object.freeze({
    state: Object.freeze({
      order: result.state.order,
      buyingPower: input.state.buyingPower,
      reconciliation: result.state,
    }),
    applied: result.applied,
    duplicate: result.duplicate,
  });
}
