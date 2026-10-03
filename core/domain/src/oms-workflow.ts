import type { Account } from "./account.js";
import { applyExecutionToAccountPortfolio } from "./account-portfolio.js";
import { applyFill } from "./position.js";
import type { AccountPortfolio } from "./account-portfolio.js";
import type { BuyingPower } from "./buying-power.js";
import type { Execution } from "./execution.js";
import type { Order } from "./order.js";
import type { RiskLimits } from "./risk-boundary.js";
import type { OrderBuyingPowerReservation } from "./order-buying-power-reservation.js";
import type { ExecutionReconciliation } from "./execution-reconciliation.js";
import type { Position } from "./position.js";
import type { Portfolio } from "./portfolio.js";
import type { ExecutionEventStore } from "./execution-event-store.js";

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

export interface OmsAdmissionInput {
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

export interface OmsAdmissionResult {
  readonly admitted: boolean;
  readonly reason?: string;
  readonly state: OmsState;
  readonly buyingPower: BuyingPower;
  readonly reservation?: OrderBuyingPowerReservation;
  readonly reconciliation?: ExecutionReconciliation;
}

export interface OmsOrderState {
  readonly order: Order;
  readonly accountPortfolio: AccountPortfolio;
  readonly buyingPower: BuyingPower;
  readonly reservation?: OrderBuyingPowerReservation;
  readonly reconciliation: ExecutionReconciliation;
}

export interface OmsAdmittedState extends OmsOrderState {
  readonly order: Order;
}

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

function requireNonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`${field} must not be empty`);
  }
  return normalized;
}

function requirePositiveFinite(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} must be a positive finite number`);
  }
  return value;
}

function terminal(order: Order): boolean {
  return ["filled", "cancelled", "rejected", "expired"].includes(order.status);
}

function applyOrderTransition(order: Order, nextStatus: OmsState): Order {
  const transitions: Readonly<Record<OmsState, readonly OmsState[]>> = {
    created: ["submitted", "cancelled", "rejected", "expired"],
    submitted: ["acknowledged", "cancel_requested", "rejected", "expired"],
    acknowledged: ["partially_filled", "filled", "cancel_requested", "rejected", "expired"],
    partially_filled: ["filled", "cancel_requested"],
    filled: [],
    cancel_requested: ["cancelled", "filled"],
    cancelled: [],
    rejected: [],
    expired: [],
  };

  if (!transitions[order.status].includes(nextStatus)) {
    throw new Error(`cannot transition order from ${order.status} to ${nextStatus}`);
  }

  return Object.freeze({ ...order, status: nextStatus });
}

function applyFillOrder(order: Order, fillQuantity: number): Order {
  if (!Number.isFinite(fillQuantity) || fillQuantity <= 0) {
    throw new Error("fillQuantity must be a positive finite number");
  }
  if (terminal(order)) {
    throw new Error(`cannot fill a terminal order from status ${order.status}`);
  }
  const remaining = order.quantity - order.filledQuantity;
  if (fillQuantity > remaining) {
    throw new Error("fillQuantity cannot exceed remaining order quantity");
  }
  const filled = order.filledQuantity + fillQuantity;
  return Object.freeze({
    ...order,
    filledQuantity: filled,
    status: filled === order.quantity ? "filled" : "partially_filled",
  });
}

function createReconciliation(order: Order, accountPortfolio: AccountPortfolio): ExecutionReconciliation {
  if (order.accountId !== accountPortfolio.accountId) {
    throw new Error("order accountId does not match account portfolio account id");
  }
  return Object.freeze({ order, accountPortfolio, appliedExecutionIds: new Set<string>() });
}

export function admitOmsOrder(input: OmsAdmissionInput): OmsAdmissionResult {
  const { order, accountPortfolio, buyingPower, riskLimits, orderNotional, projectedPositionNotional, projectedGrossExposure, projectedNetExposure, dailyLoss } = input;

  if (!Number.isFinite(orderNotional) || orderNotional <= 0) {
    throw new Error("orderNotional must be a positive finite number");
  }

  if (order.status !== "created") {
    return {
      admitted: false,
      reason: `order cannot be admitted from status ${order.status}`,
      state: order.status,
      buyingPower,
    };
  }

  const checks = [
    { result: orderNotional <= riskLimits.maxOrderNotional, reason: "order notional exceeds configured limit" },
    { result: projectedPositionNotional <= riskLimits.maxPositionNotional, reason: "projected position notional exceeds configured limit" },
    { result: projectedGrossExposure <= riskLimits.maxGrossExposure, reason: "projected gross exposure exceeds configured limit" },
    { result: Math.abs(projectedNetExposure) <= riskLimits.maxNetExposure, reason: "projected net exposure exceeds configured limit" },
    { result: dailyLoss <= riskLimits.maxDailyLoss, reason: "daily loss exceeds configured limit" },
  ];

  const riskFailure = checks.find((check) => !check.result);
  if (riskFailure) {
    return {
      admitted: false,
      reason: riskFailure.reason,
      state: order.status,
      buyingPower,
    };
  }

  const available = buyingPower.totalCapacity - buyingPower.reservedCapacity;
  if (orderNotional > available) {
    return {
      admitted: false,
      reason: "order notional exceeds available buying power",
      state: order.status,
      buyingPower,
    };
  }

  const reserved = {
    orderId: order.id,
    initialAmount: orderNotional,
    remainingAmount: orderNotional,
    quantity: order.quantity,
  };

  return {
    admitted: true,
    state: "submitted",
    buyingPower: {
      ...buyingPower,
      reservedCapacity: buyingPower.reservedCapacity + orderNotional,
    },
    reservation: reserved,
    reconciliation: createReconciliation(order, accountPortfolio),
  };
}

export function submitOmsOrder(input: OmsOrderState): OmsOrderState {
  const order = input.order;
  if (terminal(order)) {
    throw new Error(`cannot submit a terminal order from status ${order.status}`);
  }
  return Object.freeze({
    ...input,
    order: applyOrderTransition(order, "submitted"),
  });
}

export function acknowledgeOmsOrder(input: OmsOrderState): OmsOrderState {
  const order = input.order;
  if (terminal(order)) {
    throw new Error(`cannot acknowledge a terminal order from status ${order.status}`);
  }
  return Object.freeze({
    ...input,
    order: applyOrderTransition(order, "acknowledged"),
  });
}

export function rejectOmsOrder(input: OmsRejectState): OmsRejectState {
  const order = input.order;
  if (terminal(order)) {
    throw new Error(`cannot reject a terminal order from status ${order.status}`);
  }
  return {
    order: applyOrderTransition(order, "rejected"),
    accountPortfolio: input.accountPortfolio,
    buyingPower: input.buyingPower,
  };
}

export function expireOmsOrder(existing: OmsOrderState): OmsOrderState {
  const order = existing.order;
  if (terminal(order)) {
    throw new Error(`cannot expire a terminal order from status ${order.status}`);
  }
  return Object.freeze({
    ...existing,
    order: applyOrderTransition(order, "expired"),
  });
}

export function processOmsExecution(
  input: OmsProcessExecutionInput,
): OmsProcessExecutionResult {
  const { state, execution, eventStore, eventId, recordedAt } = input;

  if (eventStore.hasExecution(execution.id)) {
    return {
      state: Object.freeze({ ...state, reconciliation: createReconciliation(state.order, state.accountPortfolio) }),
      applied: false,
      duplicate: true,
    };
  }

  const reconciliationInput = Object.freeze({
    order: state.order,
    accountPortfolio: state.accountPortfolio,
    appliedExecutionIds: new Set(state.reconciliation.appliedExecutionIds),
  });

  const nextReconciliation = reconcileOmsExecution(reconciliationInput, execution);
  const applied = nextReconciliation !== state.reconciliation;

  if (applied) {
    eventStore.append({
      eventId,
      execution,
      recordedAt,
    });
  }

  return {
    state: Object.freeze({ ...state, reconciliation: nextReconciliation }),
    applied,
    duplicate: !applied,
  };
}

function reconcileOmsExecution(
  state: ExecutionReconciliation,
  execution: Execution,
): ExecutionReconciliation {
  if (execution.orderId !== state.order.id) {
    throw new Error("execution orderId does not match order id");
  }
  if (execution.instrumentId !== state.order.instrumentId) {
    throw new Error("execution instrumentId does not match order instrument");
  }
  if (execution.side !== state.order.side) {
    throw new Error("execution side does not match order side");
  }
  if (state.appliedExecutionIds.has(execution.id)) {
    return state;
  }
  if (execution.quantity > state.order.quantity - state.order.filledQuantity) {
    throw new Error("fill quantity exceeds remaining order quantity");
  }

  const nextOrder = applyFillOrder(state.order, execution.quantity);
  const nextPortfolio = applyExecutionToAccountPortfolio(state.accountPortfolio, execution);

  const appliedExecutionIds = new Set(state.appliedExecutionIds);
  appliedExecutionIds.add(execution.id);

  return Object.freeze({
    order: nextOrder,
    accountPortfolio: nextPortfolio,
    appliedExecutionIds,
  });
}

export function requestOmsCancellation(input: OmsCancelInput): OmsCancelResult {
  const order = input.state.order;
  if (terminal(order)) {
    throw new Error(`cannot cancel a terminal order from status ${order.status}`);
  }
  if (order.status === "cancel_requested") {
    return {
      state: input.state,
      order: order,
      released: false,
    };
  }
  if (order.filledQuantity === order.quantity) {
    return {
      state: input.state,
      order: order,
      released: false,
    };
  }

  const nextOrder = applyOrderTransition(order, "cancel_requested");
  const reconciliation = createReconciliation(nextOrder, input.state.accountPortfolio);

  return {
    state: Object.freeze({
      ...input.state,
      order: nextOrder,
      reconciliation,
    }),
    order: nextOrder,
    released: false,
  };
}

export function completeOmsCancellation(input: OmsCancelInput): OmsCancelResult {
  const order = input.state.order;
  if (terminal(order)) {
    throw new Error(`cannot cancel a terminal order from status ${order.status}`);
  }
  if (order.status !== "cancel_requested") {
    throw new Error(`cannot complete cancellation from status ${order.status}`);
  }

  const nextOrder = applyOrderTransition(order, "cancelled");
  const reconciliation = createReconciliation(nextOrder, input.state.accountPortfolio);

  return {
    state: Object.freeze({
      ...input.state,
      order: nextOrder,
      reconciliation,
    }),
    order: nextOrder,
    released: input.state.reservation !== undefined && input.state.reservation.remainingAmount > 0,
  };
}

export function applyOmsExecutionToPortfolio(
  accountPortfolio: AccountPortfolio,
  execution: Execution,
): AccountPortfolio {
  const currentPosition = accountPortfolio.portfolio.positions.get(execution.instrumentId)
    ?? createPosition(execution.instrumentId);

  const updatedPosition = applyFill(currentPosition, execution.side, {
    quantity: execution.quantity,
    price: execution.price,
  });

  return Object.freeze({
    accountId: accountPortfolio.accountId,
    portfolio: setPosition(accountPortfolio.portfolio, updatedPosition),
  });
}

function createPosition(instrumentId: string): Position {
  return Object.freeze({
    instrumentId,
    quantity: 0,
    averagePrice: undefined,
    realizedPnl: 0,
    side: "flat",
  });
}

function createPortfolio(): Portfolio {
  return Object.freeze({ positions: new Map(), realizedPnl: 0, unrealizedPnl: 0, marketValue: 0, netExposure: 0, grossExposure: 0 });
}

function setPosition(portfolio: Portfolio, position: Position): Portfolio {
  const positions = new Map(portfolio.positions);
  if (position.quantity === 0) {
    positions.delete(position.instrumentId);
  } else {
    positions.set(position.instrumentId, position);
  }
  const value = position.quantity * (position.averagePrice ?? 0);
  return Object.freeze({
    ...portfolio,
    positions,
    realizedPnl: portfolio.realizedPnl + (position.realizedPnl - 0),
    marketValue: portfolio.marketValue + value,
    netExposure: portfolio.netExposure + value,
    grossExposure: portfolio.grossExposure + Math.abs(value),
  });
}
