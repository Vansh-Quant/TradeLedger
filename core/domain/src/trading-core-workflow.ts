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
import {
  applyReservationRelease,
  createOrderBuyingPowerReservation,
  releaseRemainingOrderReservation,
  releaseReservationForFill,
  type OrderBuyingPowerReservation,
} from "./order-buying-power-reservation.js";
import type { RiskLimits } from "./risk-boundary.js";

export interface TradingCoreState {
  readonly order: Order;
  readonly buyingPower: BuyingPower;
  readonly reservation?: OrderBuyingPowerReservation;
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
  const reservation = createOrderBuyingPowerReservation(
    acknowledged,
    input.orderNotional,
  );
  const reconciliation = createExecutionReconciliation(
    acknowledged,
    input.accountPortfolio,
  );

  return Object.freeze({
    admitted: true,
    state: Object.freeze({
      order: acknowledged,
      buyingPower: admission.buyingPower,
      reservation,
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

  let buyingPower = input.state.buyingPower;
  let reservation = input.state.reservation;

  if (result.applied && reservation !== undefined) {
    const nextReservation = releaseReservationForFill(
      reservation,
      input.execution.quantity,
    );
    buyingPower = applyReservationRelease(
      buyingPower,
      reservation,
      nextReservation,
    );
    reservation = nextReservation;
  }

  let nextState: TradingCoreState = Object.freeze({
    order: result.state.order,
    buyingPower,
    ...(reservation === undefined ? {} : { reservation }),
    reconciliation: result.state,
  });

  // IOC semantics: any unfilled remainder is cancelled immediately after an
  // applied partial execution. The fill remains authoritative; only the
  // outstanding reservation is released.
  if (
    result.applied &&
    nextState.order.timeInForce === "ioc" &&
    nextState.order.status === "partially_filled"
  ) {
    nextState = completeTradingOrderCancellation(
      requestTradingOrderCancellation(nextState),
    );
  }

  return Object.freeze({
    state: nextState,
    applied: result.applied,
    duplicate: result.duplicate,
  });
}


export function expireTradingOrder(
  state: TradingCoreState,
): TradingCoreState {
  const order = transitionOrder(state.order, "expired");
  const reservation = state.reservation;

  if (reservation === undefined) {
    return Object.freeze({
      ...state,
      order,
      reconciliation: createExecutionReconciliation(
        order,
        state.reconciliation.accountPortfolio,
      ),
    });
  }

  const releasedReservation = releaseRemainingOrderReservation(reservation);
  const buyingPower = applyReservationRelease(
    state.buyingPower,
    reservation,
    releasedReservation,
  );

  return Object.freeze({
    ...state,
    order,
    buyingPower,
    reservation: releasedReservation,
    reconciliation: createExecutionReconciliation(
      order,
      state.reconciliation.accountPortfolio,
    ),
  });
}

export function requestTradingOrderCancellation(
  state: TradingCoreState,
): TradingCoreState {
  const order = transitionOrder(state.order, "cancel_requested");

  return Object.freeze({
    ...state,
    order,
    reconciliation: createExecutionReconciliation(
      order,
      state.reconciliation.accountPortfolio,
    ),
  });
}

export function completeTradingOrderCancellation(
  state: TradingCoreState,
): TradingCoreState {
  const order = transitionOrder(state.order, "cancelled");
  const reservation = state.reservation;

  if (reservation === undefined) {
    return Object.freeze({
      ...state,
      order,
      reconciliation: createExecutionReconciliation(
        order,
        state.reconciliation.accountPortfolio,
      ),
    });
  }

  const releasedReservation = releaseRemainingOrderReservation(reservation);
  const buyingPower = applyReservationRelease(
    state.buyingPower,
    reservation,
    releasedReservation,
  );

  return Object.freeze({
    ...state,
    order,
    buyingPower,
    reservation: releasedReservation,
    reconciliation: createExecutionReconciliation(
      order,
      state.reconciliation.accountPortfolio,
    ),
  });
}
