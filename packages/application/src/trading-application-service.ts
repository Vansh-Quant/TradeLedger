import {
  createOrder,
  admitTradingOrder,
  requestTradingOrderCancellation,
  completeTradingOrderCancellation,
  type AccountId,
  type InstrumentId,
} from "@tradeledger/domain";
import type {
  AuditEventPort,
  AuthorizationPort,
  CancelOrderCommand,
  CancelOrderResult,
  CompleteOrderCancellationCommand,
  Clock,
  GetOrderQuery,
  GetOrderResult,
  MutationIdempotencyPort,
  OrderIdGenerator,
  OrderStatePort,
  SubmitOrderCommand,
  SubmitOrderResult,
  TradingContextPort,
} from "./contracts.js";
import { InMemoryAuditEventStore, InMemoryMutationIdempotency, mutationFingerprint } from "./default-adapters.js";
import {
  NotFoundError,
  ValidationError,
} from "./errors.js";

function requireNonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new ValidationError(`${field} must not be empty`);
  return normalized;
}

function requirePositiveFinite(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new ValidationError(`${field} must be a finite positive number`);
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
    private readonly idempotency: MutationIdempotencyPort = new InMemoryMutationIdempotency(),
    private readonly audit: AuditEventPort = new InMemoryAuditEventStore(),
  ) {}

  submitOrder(command: SubmitOrderCommand): SubmitOrderResult {
    const accountId = requireNonEmpty(command.accountId, "accountId") as AccountId;
    const instrumentId = requireNonEmpty(command.instrumentId, "instrumentId") as InstrumentId;
    requirePositiveFinite(command.quantity, "quantity");
    requirePositiveFinite(command.orderNotional, "orderNotional");

    this.authorization.authorize(command.principal, "order.submit", accountId);
    const requestId = command.requestId ?? crypto.randomUUID();
    const run = () => this.submitOrderCore(command, accountId, instrumentId);

    return this.mutate(
      "order.submit",
      accountId,
      command.principal,
      command.idempotencyKey,
      requestId,
      command,
      run,
    );
  }

  private submitOrderCore(
    command: SubmitOrderCommand,
    accountId: AccountId,
    instrumentId: InstrumentId,
  ): SubmitOrderResult {
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
      ...(command.limitPrice === undefined ? {} : { limitPrice: command.limitPrice }),
      ...(command.stopPrice === undefined ? {} : { stopPrice: command.stopPrice }),
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

    return Object.freeze({
      admitted: admission.admitted,
      order: admission.state.order,
      state: admission.state,
      ...(admission.reason === undefined ? {} : { reason: admission.reason }),
    });
  }

  cancelOrder(command: CancelOrderCommand): CancelOrderResult {
    const accountId = requireNonEmpty(command.accountId, "accountId") as AccountId;
    const orderId = requireNonEmpty(command.orderId, "orderId");
    this.authorization.authorize(command.principal, "order.cancel", accountId);

    return this.mutate(
      "order.cancel",
      accountId,
      command.principal,
      command.idempotencyKey,
      command.requestId ?? crypto.randomUUID(),
      command,
      () => {
        const current = this.orders.get(orderId);
        if (current === undefined || current.order.accountId !== accountId) {
          throw new NotFoundError(`order ${orderId} was not found`);
        }
        const requested = requestTradingOrderCancellation(current);
        this.orders.save(requested);
        return Object.freeze({ order: requested.order, state: requested });
      },
    );
  }

  completeOrderCancellation(command: CompleteOrderCancellationCommand): CancelOrderResult {
    const accountId = requireNonEmpty(command.accountId, "accountId") as AccountId;
    const orderId = requireNonEmpty(command.orderId, "orderId");
    this.authorization.authorize(command.principal, "order.cancel", accountId);

    return this.mutate(
      "order.cancel",
      accountId,
      command.principal,
      command.idempotencyKey,
      command.requestId ?? crypto.randomUUID(),
      command,
      () => {
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
        return Object.freeze({ order: cancelled.order, state: cancelled });
      },
    );
  }

  getOrder(query: GetOrderQuery): GetOrderResult {
    const accountId = requireNonEmpty(query.accountId, "accountId") as AccountId;
    const orderId = requireNonEmpty(query.orderId, "orderId");
    this.authorization.authorize(query.principal, "order.read", accountId);
    const state = this.orders.get(orderId);

    if (state === undefined || state.order.accountId !== accountId) {
      throw new NotFoundError(`order ${orderId} was not found`);
    }

    return Object.freeze({ order: state.order, state });
  }

  private mutate<T>(
    action: "order.submit" | "order.cancel",
    accountId: AccountId,
    principal: SubmitOrderCommand["principal"],
    key: string | undefined,
    requestId: string,
    payload: unknown,
    operation: () => T,
  ): T {
    const execute = () => {
      this.audit.append({
        id: crypto.randomUUID(),
        type: `${action}.requested`,
        timestamp: this.clock.now(),
        principalId: principal.id,
        accountId,
        action,
        requestId,
        ...(key === undefined ? {} : { idempotencyKey: key }),
        outcome: "success",
      });

      try {
        const result = operation();
        this.audit.append({
          id: crypto.randomUUID(),
          type: `${action}.completed`,
          timestamp: this.clock.now(),
          principalId: principal.id,
          accountId,
          action,
          requestId,
          ...(key === undefined ? {} : { idempotencyKey: key }),
          outcome: "success",
        });
        return result;
      } catch (error) {
        this.audit?.append({
          id: crypto.randomUUID(),
          type: `${action}.failed`,
          timestamp: this.clock.now(),
          principalId: principal.id,
          accountId,
          action,
          requestId,
          ...(key === undefined ? {} : { idempotencyKey: key }),
          outcome: "failure",
          reason: error instanceof Error ? error.message : "unknown error",
        });
        throw error;
      }
    };

    if (key === undefined) return execute();

    return this.idempotency.execute(
      key,
      action,
      accountId,
      principal,
      mutationFingerprint(payloadWithoutTransportMetadata(payload)),
      execute,
    );
  }
}

function payloadWithoutTransportMetadata(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const { requestId: _requestId, idempotencyKey: _idempotencyKey, ...payload } = value as Record<string, unknown>;
  return payload;
}

export function fixedClock(now: string): Clock {
  if (!Number.isFinite(Date.parse(now))) {
    throw new ValidationError("clock value must be a valid timestamp");
  }
  return Object.freeze({ now: () => now });
}

export function fixedOrderIdGenerator(id: string): OrderIdGenerator {
  const normalized = requireNonEmpty(id, "order id");
  return Object.freeze({ next: () => normalized });
}
