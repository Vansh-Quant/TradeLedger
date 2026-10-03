import {
  createOrder,
  admitTradingOrder,
  requestTradingOrderCancellation,
  completeTradingOrderCancellation,
  type AccountId,
  type InstrumentId,
} from "@tradeledger/domain";
import type {
  AuthorizationPort,
  CancelOrderCommand,
  CancelOrderResult,
  CompleteOrderCancellationCommand,
  Clock,
  GetOrderQuery,
  GetOrderResult,
  OrderIdGenerator,
  OrderStatePort,
  SubmitOrderCommand,
  SubmitOrderResult,
  TradingContextPort,
} from "./contracts.js";
import {
  AdmissionError,
  NotFoundError,
  ValidationError,
} from "./errors.js";

function requireNonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new ValidationError(`${field} must not be empty`);
  }
  return normalized;
}

function requirePositiveFinite(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new ValidationError(
      `${field} must be a finite positive number`,
    );
  }
  return value;
}

export class TradingApplicationService {
  constructor(
    private readonly context: TradingContextPort,
    private readonly orders: OrderStatePort,
    private readonly authorization: AuthorizationPort,
    private readonly orderIds: OrderIdGenerator,
    private readonly clock: Clock,
  ) {}

  submitOrder(command: SubmitOrderCommand): SubmitOrderResult {
    const accountId = requireNonEmpty(command.accountId, "accountId") as AccountId;
    const instrumentId = requireNonEmpty(
      command.instrumentId,
      "instrumentId",
    ) as InstrumentId;

    requirePositiveFinite(command.quantity, "quantity");
    requirePositiveFinite(command.orderNotional, "orderNotional");

    this.authorization.authorize(
      command.principal,
      "order.submit",
      accountId,
    );

    const tradingContext = this.context.getContext(accountId);

    if (tradingContext.accountId !== accountId) {
      throw new ValidationError("trading context account does not match command");
    }

    const order = createOrder({
      id: this.orderIds.next(),
      accountId,
      instrumentId,
      side: command.side,
      type: command.type,
      quantity: command.quantity,
      ...(command.limitPrice === undefined
        ? {}
        : { limitPrice: command.limitPrice }),
      ...(command.stopPrice === undefined
        ? {}
        : { stopPrice: command.stopPrice }),
      timeInForce: command.timeInForce,
      createdAt: this.clock.now(),
    });

    const admission = admitTradingOrder({
      order,
      accountPortfolio: tradingContext.accountPortfolio,
      buyingPower: tradingContext.buyingPower,
      riskLimits: tradingContext.riskLimits,
      orderNotional: command.orderNotional,
      projectedPositionNotional: command.projectedPositionNotional,
      projectedGrossExposure: command.projectedGrossExposure,
      projectedNetExposure: command.projectedNetExposure,
      dailyLoss: command.dailyLoss,
    });

    this.orders.save(admission.state);
    this.context.saveContext({
      ...tradingContext,
      buyingPower: admission.state.buyingPower,
    });

    const result: SubmitOrderResult = {
      admitted: admission.admitted,
      order: admission.state.order,
      state: admission.state,
      ...(admission.reason === undefined ? {} : { reason: admission.reason }),
    };

    if (!admission.admitted) {
      return Object.freeze(result);
    }

    return Object.freeze(result);
  }

  cancelOrder(command: CancelOrderCommand): CancelOrderResult {
    const accountId = requireNonEmpty(command.accountId, "accountId") as AccountId;
    const orderId = requireNonEmpty(command.orderId, "orderId");

    this.authorization.authorize(
      command.principal,
      "order.cancel",
      accountId,
    );

    const current = this.orders.get(orderId);

    if (current === undefined) {
      throw new NotFoundError(`order ${orderId} was not found`);
    }

    if (current.order.accountId !== accountId) {
      throw new NotFoundError(`order ${orderId} was not found`);
    }

    const requested = requestTradingOrderCancellation(current);

    this.orders.save(requested);

    return Object.freeze({
      order: requested.order,
      state: requested,
    });
  }


  completeOrderCancellation(
    command: CompleteOrderCancellationCommand,
  ): CancelOrderResult {
    const accountId = requireNonEmpty(command.accountId, "accountId") as AccountId;
    const orderId = requireNonEmpty(command.orderId, "orderId");

    this.authorization.authorize(
      command.principal,
      "order.cancel",
      accountId,
    );

    const current = this.orders.get(orderId);

    if (current === undefined || current.order.accountId !== accountId) {
      throw new NotFoundError(`order ${orderId} was not found`);
    }

    const cancelled = completeTradingOrderCancellation(current);

    this.orders.save(cancelled);
    this.context.saveContext({
      ...this.context.getContext(accountId),
      buyingPower: cancelled.buyingPower,
    });

    return Object.freeze({
      order: cancelled.order,
      state: cancelled,
    });
  }

  getOrder(query: GetOrderQuery): GetOrderResult {
    const accountId = requireNonEmpty(query.accountId, "accountId") as AccountId;
    const orderId = requireNonEmpty(query.orderId, "orderId");

    this.authorization.authorize(
      query.principal,
      "order.read",
      accountId,
    );

    const state = this.orders.get(orderId);

    if (state === undefined || state.order.accountId !== accountId) {
      throw new NotFoundError(`order ${orderId} was not found`);
    }

    return Object.freeze({
      order: state.order,
      state,
    });
  }
}

export function fixedClock(now: string): Clock {
  if (!Number.isFinite(Date.parse(now))) {
    throw new ValidationError("clock value must be a valid timestamp");
  }

  return Object.freeze({
    now: () => now,
  });
}

export function fixedOrderIdGenerator(id: string): OrderIdGenerator {
  const normalized = requireNonEmpty(id, "order id");
  return Object.freeze({
    next: () => normalized,
  });
}
