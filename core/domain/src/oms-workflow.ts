import type { AccountPortfolio } from "./account-portfolio.js";
import type { BuyingPower } from "./buying-power.js";
import type { Execution } from "./execution.js";
import type { ExecutionEventStore } from "./execution-event-store.js";
import {
  admitTradingOrder,
  completeTradingOrderCancellation,
  processTradingExecution,
  expireTradingOrder,
  requestTradingOrderCancellation,
  type TradingCoreAdmissionInput,
  type TradingCoreState,
} from "./trading-core-workflow.js";
import { transitionOrder } from "./order-lifecycle.js";
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

function mapOrderState(
  input: OmsOrderState,
  nextStatus: Parameters<typeof transitionOrder>[1],
): OmsOrderState {
  const order = transitionOrder(input.order, nextStatus);

  return Object.freeze({
    ...input,
    order,
    reconciliation: Object.freeze({
      ...input.reconciliation,
      order,
    }),
  });
}

export function submitOmsOrder(input: OmsOrderState): OmsOrderState {
  return mapOrderState(input, "submitted");
}

export function acknowledgeOmsOrder(input: OmsOrderState): OmsOrderState {
  return mapOrderState(input, "acknowledged");
}

export function rejectOmsOrder(input: OmsRejectState): OmsRejectState {
  return Object.freeze({
    ...input,
    order: transitionOrder(input.order, "rejected"),
  });
}

export function expireOmsOrder(input: OmsOrderState): OmsOrderState {
  return expireTradingOrder(input);
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
