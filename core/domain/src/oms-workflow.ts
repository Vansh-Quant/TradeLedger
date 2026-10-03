import type { AccountPortfolio } from "./account-portfolio.js";
import type { BuyingPower } from "./buying-power.js";
import type { Execution } from "./execution.js";
import type { ExecutionEventStore } from "./execution-event-store.js";
import {
  admitTradingOrder,
  completeTradingOrderCancellation,
  processTradingExecution,
  requestTradingOrderCancellation,
  type TradingCoreAdmissionInput,
  type TradingCoreState,
} from "./trading-core-workflow.js";
import type { Order } from "./order.js";
import type { RiskLimits } from "./risk-boundary.js";

export const OMS_STATES = [
  "created",
  "submitted",
  "acknowledged",
  "partially_filled",
  "filled",
  "cancel_requested",
  "cancelled",
  "rejected",
  "expired",
] as const;

export type OmsState = (typeof OMS_STATES)[number];

export interface OmsAdmissionInput extends TradingCoreAdmissionInput {}

export interface OmsAdmissionResult {
  readonly admitted: boolean;
  readonly reason?: string;
  readonly state: TradingCoreState;
}

export type OmsOrderState = TradingCoreState;

export interface OmsAdmittedState extends OmsOrderState {}

export interface OmsRejectState {
  readonly order: Order;
  readonly accountPortfolio: AccountPortfolio;
  readonly buyingPower: BuyingPower;
}

export interface OmsProcessExecutionInput {
  readonly state: OmsOrderState;
  readonly execution: Execution;
  readonly eventStore: ExecutionEventStore;
  readonly eventId: string;
  readonly recordedAt: string;
}

export interface OmsProcessExecutionResult {
  readonly state: OmsOrderState;
  readonly applied: boolean;
  readonly duplicate: boolean;
}

export interface OmsCancelInput {
  readonly state: OmsOrderState;
  readonly reason?: string;
}

export interface OmsCancelResult {
  readonly state: OmsOrderState;
  readonly order: Order;
  readonly released: boolean;
}

export function admitOmsOrder(input: OmsAdmissionInput): OmsAdmissionResult {
  const result = admitTradingOrder(input);

  return Object.freeze({
    admitted: result.admitted,
    ...(result.reason === undefined ? {} : { reason: result.reason }),
    state: result.state,
  });
}

export function submitOmsOrder(input: OmsOrderState): OmsOrderState {
  if (input.order.status !== "created") {
    throw new Error(
      `cannot submit a terminal or already-submitted order from status ${input.order.status}`,
    );
  }

  return Object.freeze({
    ...input,
    order: Object.freeze({ ...input.order, status: "submitted" }),
    reconciliation: Object.freeze({
      ...input.reconciliation,
      order: Object.freeze({ ...input.order, status: "submitted" }),
    }),
  });
}

export function acknowledgeOmsOrder(input: OmsOrderState): OmsOrderState {
  if (input.order.status !== "submitted") {
    throw new Error(
      `cannot acknowledge order from status ${input.order.status}`,
    );
  }

  const order = Object.freeze({ ...input.order, status: "acknowledged" });

  return Object.freeze({
    ...input,
    order,
    reconciliation: Object.freeze({
      ...input.reconciliation,
      order,
    }),
  });
}

export function rejectOmsOrder(input: OmsRejectState): OmsRejectState {
  if (
    input.order.status !== "created" &&
    input.order.status !== "submitted" &&
    input.order.status !== "acknowledged"
  ) {
    throw new Error(
      `cannot reject order from status ${input.order.status}`,
    );
  }

  return Object.freeze({
    ...input,
    order: Object.freeze({ ...input.order, status: "rejected" }),
  });
}

export function expireOmsOrder(input: OmsOrderState): OmsOrderState {
  if (
    input.order.status !== "created" &&
    input.order.status !== "submitted" &&
    input.order.status !== "acknowledged"
  ) {
    throw new Error(
      `cannot expire order from status ${input.order.status}`,
    );
  }

  const order = Object.freeze({ ...input.order, status: "expired" });

  return Object.freeze({
    ...input,
    order,
    reconciliation: Object.freeze({
      ...input.reconciliation,
      order,
    }),
  });
}

export function processOmsExecution(
  input: OmsProcessExecutionInput,
): OmsProcessExecutionResult {
  return processTradingExecution(input);
}

export function requestOmsCancellation(
  input: OmsCancelInput,
): OmsCancelResult {
  const state = requestTradingOrderCancellation(input.state);

  return Object.freeze({
    state,
    order: state.order,
    released: false,
  });
}

export function completeOmsCancellation(
  input: OmsCancelInput,
): OmsCancelResult {
  const state = completeTradingOrderCancellation(input.state);

  return Object.freeze({
    state,
    order: state.order,
    released:
      input.state.reservation !== undefined &&
      state.reservation !== undefined &&
      state.reservation.remainingAmount <
        input.state.reservation.remainingAmount,
  });
}

/**
 * Compatibility alias for callers that historically imported the OMS
 * admission types directly.
 */
export type OmsRiskLimits = RiskLimits;
