import {
  createOrder,
  createExecution,
  admitTradingOrder,
  processTradingExecution,
  InMemoryExecutionEventStore,
  requestTradingOrderCancellation,
  completeTradingOrderCancellation,
  type AccountId,
  type InstrumentId,
} from "@tradeledger/domain";
import type {
  ApplicationTransactionPort,
  AuditEventPort,
  AuthorizationPort,
  CancelOrderCommand,
  CancelOrderResult,
  CompleteOrderCancellationCommand,
  Clock,
  GetOrderQuery,
  GetOrderResult,
  GetTradingContextQuery,
  ListOrdersQuery,
  ListOrdersResult,
  MarketDataStatePort,
  GetTradingContextResult,
  RecordExecutionCommand,
  RecordExecutionResult,
  MutationIdempotencyPort,
  OrderIdGenerator,
  OrderStatePort,
  SubmitOrderCommand,
  SubmitOrderResult,
  TradingContextPort,
  ApplicationPrincipal,\n  ApplicationEventPort,
} from "./contracts.js";
import { InMemoryApplicationEventBus, InMemoryApplicationTransaction, InMemoryAuditEventStore, InMemoryMutationIdempotency, mutationFingerprint } from "./default-adapters.js";
import {
  ApplicationError,
  NotFoundError,
  ValidationError,
} from "./errors.js";

function requireNonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new ValidationError(`${field} must not be empty`);
  return normalized;
}

function requireIdempotencyKey(value: string): string {
  if (value.length === 0 || value.length > 128 || !/^[\x21-\x7e]+$/.test(value)) {
    throw new ValidationError("idempotency key is invalid");
  }
  return value;
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
    private readonly transaction: ApplicationTransactionPort = new InMemoryApplicationTransaction(),
    private readonly marketData: MarketDataStatePort | undefined = undefined,
    private readonly executions: import("@tradeledger/domain").ExecutionEventStore = new InMemoryExecutionEventStore(),\n    private readonly events: ApplicationEventPort = new InMemoryApplicationEventBus(),
  ) {}

  submitOrderFromIntent(command: Omit<SubmitOrderCommand, "orderNotional" | "projectedPositionNotional" | "projectedGrossExposure" | "projectedNetExposure" | "dailyLoss">): SubmitOrderResult {
    const accountId = requireNonEmpty(command.accountId, "accountId") as AccountId;
    const context = this.context.getContext(accountId);
    const orderPrice = command.limitPrice;
    if (orderPrice === undefined) {
      throw new ValidationError("market admission requires authoritative pricing; use a limit order until market pricing is available");
    }

    const existing = context.accountPortfolio.portfolio;
    const currentGross = existing.grossExposure;
    const currentNet = existing.netExposure;
    const orderNotional = command.quantity * orderPrice;
    const signedNotional = command.side === "buy" ? orderNotional : -orderNotional;
    const currentPosition = existing.positions.get(command.instrumentId);
    const currentPositionNotional = currentPosition === undefined
      ? 0
      : currentPosition.quantity * (currentPosition.averagePrice ?? orderPrice);

    return this.submitOrder({
      ...command,
      orderNotional,
      projectedPositionNotional: Math.abs(currentPositionNotional + signedNotional),
      projectedGrossExposure: currentGross + orderNotional,
      projectedNetExposure: currentNet + signedNotional,
      dailyLoss: 0,
    });
  }

  submitOrder(command: SubmitOrderCommand): SubmitOrderResult {
    const accountId = requireNonEmpty(command.accountId, "accountId") as AccountId;
    const instrumentId = requireNonEmpty(command.instrumentId, "instrumentId") as InstrumentId;
    requirePositiveFinite(command.quantity, "quantity");
    requirePositiveFinite(command.orderNotional, "orderNotional");

    const requestId = command.requestId ?? crypto.randomUUID();
    this.authorize(command.principal, "order.submit", accountId, requestId, command.idempotencyKey);
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

    if (admission.admitted) {
      this.publishEvent("order.submitted", "order", admission.state.order.id, accountId, command.requestId ?? "", {
        instrumentId,
        side: command.side,
        quantity: command.quantity,
      });
    }

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
    const requestId = command.requestId ?? crypto.randomUUID();
    this.authorize(command.principal, "order.cancel", accountId, requestId, command.idempotencyKey);

    return this.mutate(
      "order.cancel",
      accountId,
      command.principal,
      command.idempotencyKey,
      requestId,
      command,
      () => {
        const current = this.orders.get(orderId);
        if (current === undefined || current.order.accountId !== accountId) {
          throw new NotFoundError(`order ${orderId} was not found`);
        }
        const requested = requestTradingOrderCancellation(current);
        this.orders.save(requested);
        this.publishEvent("order.cancel.requested", "order", requested.order.id, accountId, requestId, {
          remainingQuantity: requested.order.quantity - requested.order.filledQuantity,
        });
        return Object.freeze({ order: requested.order, state: requested });
      },
    );
  }

  completeOrderCancellation(command: CompleteOrderCancellationCommand): CancelOrderResult {
    const accountId = requireNonEmpty(command.accountId, "accountId") as AccountId;
    const orderId = requireNonEmpty(command.orderId, "orderId");
    const requestId = command.requestId ?? crypto.randomUUID();
    this.authorize(command.principal, "order.cancel", accountId, requestId, command.idempotencyKey);

    return this.mutate(
      "order.cancel.complete",
      accountId,
      command.principal,
      command.idempotencyKey,
      requestId,
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
        this.publishEvent("order.cancelled", "order", cancelled.order.id, accountId, requestId, {
          releasedCapacity: cancelled.buyingPower.totalCapacity - cancelled.buyingPower.reservedCapacity,
        });
        return Object.freeze({ order: cancelled.order, state: cancelled });
      },
    );
  }


  recordExecution(command: RecordExecutionCommand): RecordExecutionResult {
    let replayed = false;
    const accountId = requireNonEmpty(command.accountId, "accountId") as AccountId;
    const orderId = requireNonEmpty(command.orderId, "orderId");
    const executionId = requireNonEmpty(command.executionId, "executionId");
    const instrumentId = requireNonEmpty(command.instrumentId, "instrumentId") as InstrumentId;
    requirePositiveFinite(command.quantity, "quantity");
    requirePositiveFinite(command.price, "price");
    if (!Number.isFinite(command.commission) || command.commission < 0) {
      throw new ValidationError("commission must be a finite non-negative number");
    }

    const requestId = command.requestId ?? crypto.randomUUID();
    this.authorization.authorize(
      command.principal,
      "execution.record",
      accountId,
    );

    const result = this.mutate(
      "execution.record",
      accountId,
      command.principal,
      command.idempotencyKey,
      requestId,
      command,
      () => {
        const current = this.orders.get(orderId);
        if (current === undefined || current.order.accountId !== accountId) {
          throw new NotFoundError(`order ${orderId} was not found`);
        }

        if (current.order.instrumentId !== instrumentId) {
          throw new ValidationError("execution instrument does not match order");
        }

        if (current.order.side !== command.side) {
          throw new ValidationError("execution side does not match order");
        }

        const execution = createExecution({
          id: executionId,
          orderId,
          instrumentId,
          side: command.side,
          quantity: command.quantity,
          price: command.price,
          executedAt: command.executedAt,
          commission: command.commission,
        });

        const result = processTradingExecution({
          state: current,
          execution,
          eventStore: this.executions,
          eventId: requestId,
          recordedAt: this.clock.now(),
        });

        this.orders.save(result.state);
        this.context.saveContext({
          ...this.context.getContext(accountId),
          buyingPower: result.state.buyingPower,
          accountPortfolio: result.state.reconciliation.accountPortfolio,
        });

        if (result.applied) {
          this.publishEvent("execution.recorded", "execution", executionId, accountId, requestId, {
            orderId,
            quantity: command.quantity,
            price: command.price,
          });
        }

        return Object.freeze({
          applied: result.applied,
          duplicate: result.duplicate,
          order: result.state.order,
          state: result.state,
        });
      },
      () => {
        replayed = true;
      },
    );

    return Object.freeze({
      ...result,
      applied: replayed ? false : result.applied,
      duplicate: replayed ? true : result.duplicate,
    });
  }

  getTradingContext(query: GetTradingContextQuery): GetTradingContextResult {
    const accountId = requireNonEmpty(query.accountId, "accountId") as AccountId;
    this.authorization.authorize(query.principal, "order.read", accountId);
    return Object.freeze({ context: this.context.getContext(accountId) });
  }

  listOrders(query: ListOrdersQuery): ListOrdersResult {
    const accountId = requireNonEmpty(query.accountId, "accountId") as AccountId;
    this.authorization.authorize(query.principal, "order.read", accountId);
    const orders = this.orders.list(accountId).map((state) => Object.freeze({
      order: state.order,
      state,
    }));
    return Object.freeze({ orders: Object.freeze(orders) });
  }


  listMarketData(query: { readonly principal: ApplicationPrincipal; readonly accountId: string }): readonly import("@tradeledger/domain").MarketDataState[] {
    const accountId = requireNonEmpty(query.accountId, "accountId") as AccountId;
    this.authorization.authorize(query.principal, "market-data.read", accountId);
    if (this.marketData === undefined) return Object.freeze([]);
    return this.marketData.list();
  }

  getMarketData(query: { readonly principal: ApplicationPrincipal; readonly accountId: string; readonly instrumentId: string }): import("@tradeledger/domain").MarketDataState | undefined {
    const accountId = requireNonEmpty(query.accountId, "accountId") as AccountId;
    const instrumentId = requireNonEmpty(query.instrumentId, "instrumentId") as InstrumentId;
    this.authorization.authorize(query.principal, "market-data.read", accountId);
    return this.marketData?.get(instrumentId);
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

  private publishEvent(
    type: import("./contracts.js").ApplicationEventType,
    aggregateType: "order" | "execution",
    aggregateId: string,
    accountId: AccountId,
    requestId: string,
    payload: Readonly<Record<string, string | number>>,
  ): void {
    this.events.publish({
      eventId: crypto.randomUUID(),
      type,
      occurredAt: this.clock.now(),
      accountId,
      aggregateType,
      aggregateId,
      requestId,
      sequence: this.events.latestSequence() + 1,
      payload,
    });
  }

  private authorize(
    principal: SubmitOrderCommand["principal"],
    action: "order.submit" | "order.cancel",
    accountId: AccountId,
    requestId: string,
    idempotencyKey?: string,
  ): void {
    try {
      this.authorization.authorize(principal, action, accountId);
    } catch (error) {
      this.transaction.execute(() => {
        this.audit.append({
          id: crypto.randomUUID(),
          type: "authorization.denied",
          timestamp: this.clock.now(),
          principalId: principal.id,
          accountId,
          action,
          requestId,
          ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
          outcome: "failure",
          reason: "AUTHORIZATION_ERROR",
        });
      });
      throw error;
    }
  }

  private mutate<T>(
    mutationOperation: "order.submit" | "order.cancel" | "order.cancel.complete" | "execution.record",
    accountId: AccountId,
    principal: SubmitOrderCommand["principal"],
    key: string | undefined,
    requestId: string,
    payload: unknown,
    operation: () => T,
    onReplay?: () => void,
  ): T {
    const execute = () => {
      this.audit.append({
        id: crypto.randomUUID(),
        type: `${mutationOperation}.requested`,
        timestamp: this.clock.now(),
        principalId: principal.id,
        accountId,
        action: mutationOperation === "order.cancel.complete" ? "order.cancel" : mutationOperation,
        requestId,
        ...(key === undefined ? {} : { idempotencyKey: key }),
        outcome: "success",
      });

      try {
        const result = operation();
        this.audit.append({
          id: crypto.randomUUID(),
          type: `${mutationOperation}.completed`,
          timestamp: this.clock.now(),
          principalId: principal.id,
          accountId,
          action: mutationOperation === "order.cancel.complete" ? "order.cancel" : mutationOperation,
          requestId,
          ...(key === undefined ? {} : { idempotencyKey: key }),
          outcome: "success",
        });
        return result;
      } catch (error) {
        this.audit.append({
          id: crypto.randomUUID(),
          type: `${mutationOperation}.failed`,
          timestamp: this.clock.now(),
          principalId: principal.id,
          accountId,
          action: mutationOperation === "order.cancel.complete" ? "order.cancel" : mutationOperation,
          requestId,
          ...(key === undefined ? {} : { idempotencyKey: key }),
          outcome: "failure",
          reason: "APPLICATION_ERROR",
        });
        throw error;
      }
    };

    const transactional = () => {
      try {
        return { ok: true as const, result: key === undefined
          ? execute()
          : this.idempotency.executeOnce(
              key,
              mutationOperation,
              accountId,
              principal,
              mutationFingerprint(payloadWithoutTransportMetadata(payload)),
              execute,
              () => {
                onReplay?.();
                this.audit.append({
                  id: crypto.randomUUID(),
                  type: `${mutationOperation}.replay`,
                  timestamp: this.clock.now(),
                  principalId: principal.id,
                  accountId,
                  action: mutationOperation === "order.cancel.complete" ? "order.cancel" : mutationOperation,
                  requestId,
                  idempotencyKey: key,
                  outcome: "replay",
                });
              },
            ) };
      } catch (error) {
        if (!(error instanceof ApplicationError)) throw error;
        if (
          key !== undefined &&
          (error.code === "IDEMPOTENCY_CONFLICT" || error.code === "IDEMPOTENCY_IN_PROGRESS")
        ) {
          this.audit.append({
            id: crypto.randomUUID(),
            type: error.code === "IDEMPOTENCY_CONFLICT" ? "idempotency.conflict" : "idempotency.in_progress",
            timestamp: this.clock.now(),
            principalId: principal.id,
            accountId,
            action: mutationOperation === "order.cancel.complete" ? "order.cancel" : mutationOperation,
            requestId,
            idempotencyKey: key,
            outcome: "failure",
            reason: error.code,
          });
        }
        return { ok: false as const, error };
      }
    };

    const outcome = this.transaction.execute(transactional);
    if (!outcome.ok) throw outcome.error;
    return outcome.result;
  }
}

function payloadWithoutTransportMetadata(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const { requestId: _requestId, idempotencyKey: _idempotencyKey, principal: _principal, ...payload } = value as Record<string, unknown>;
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
