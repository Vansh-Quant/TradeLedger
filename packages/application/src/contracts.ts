import type {
  AccountId,
  AccountPortfolio,
  BuyingPower,
  InstrumentId,
  Order,
  RiskLimits,
  TradingCoreState,
} from "@tradeledger/domain";

export type ApplicationAction =
  | "order.submit"
  | "order.cancel"
  | "order.expire"
  | "order.read"
  | "market-data.read"
  | "execution.record"
  | "event-stream.read";

export interface ApplicationPrincipal {
  readonly id: string;
  readonly roles: readonly string[];
}

export interface AuthorizationPort {
  authorize(
    principal: ApplicationPrincipal,
    action: ApplicationAction,
    accountId: AccountId,
  ): void;
}

export interface MutationRecord {
  readonly key: string;
  readonly operation: string;
  readonly accountId: AccountId;
  readonly principalId: string;
  readonly fingerprint: string;
  readonly status: "in_progress" | "completed" | "failed";
  readonly createdAt: string;
  readonly completedAt?: string;
  readonly result?: unknown;
  readonly errorCode?: string;
}

export interface MutationIdempotencyPort {
  executeOnce<T>(
    key: string,
    operation: string,
    accountId: AccountId,
    principal: ApplicationPrincipal,
    fingerprint: string,
    run: () => T,
    onReplay?: () => void,
  ): T;
}

export interface AuditEvent {
  readonly id: string;
  readonly type: string;
  readonly timestamp: string;
  readonly principalId: string;
  readonly accountId: AccountId;
  readonly action: ApplicationAction;
  readonly requestId: string;
  readonly idempotencyKey?: string;
  readonly outcome: "success" | "failure" | "replay";
  readonly reason?: string;
}

export interface AuditEventPort {
  append(event: AuditEvent): void;
}

export type ApplicationEventType =
  | "order.submitted"
  | "order.rejected"
  | "order.cancel.requested"
  | "order.cancelled"
  | "order.expired"
  | "execution.recorded";

export interface ApplicationEvent {
  readonly eventId: string;
  readonly type: ApplicationEventType;
  readonly occurredAt: string;
  readonly accountId: AccountId;
  readonly aggregateType: "order" | "execution";
  readonly aggregateId: string;
  readonly requestId: string;
  readonly sequence: number;
  readonly payload: Readonly<Record<string, string | number>>;
}

export interface ApplicationEventPort {
  publish(event: ApplicationEvent): void;
  latestSequence(): number;
}

export interface ApplicationEventStreamPort extends ApplicationEventPort {
  subscribe(
    accountId: AccountId,
    subscriber: (event: ApplicationEvent) => void,
  ): () => void;
  listAfterSequence(sequence: number): readonly ApplicationEvent[];
}


export interface ApplicationTransactionPort {
  execute<T>(operation: () => T): T;
}

export interface TradingContext {
  readonly accountId: AccountId;
  readonly accountPortfolio: AccountPortfolio;
  readonly buyingPower: BuyingPower;
  readonly riskLimits: RiskLimits;
}

export interface TradingContextPort {
  getContext(accountId: AccountId): TradingContext;
  saveContext(context: TradingContext): void;
}

export interface OrderStatePort {
  save(state: TradingCoreState): void;
  get(orderId: string): TradingCoreState | undefined;
  list(accountId: AccountId): readonly TradingCoreState[];
}

export interface OrderIdGenerator {
  next(): string;
}

export interface Clock {
  now(): string;
}

export interface SubmitOrderCommand {
  readonly principal: ApplicationPrincipal;
  readonly accountId: string;
  readonly instrumentId: string;
  readonly side: "buy" | "sell";
  readonly type: "market" | "limit" | "stop" | "stop-limit";
  readonly quantity: number;
  readonly limitPrice?: number;
  readonly stopPrice?: number;
  readonly timeInForce: "day" | "gtc" | "ioc" | "fok";
  readonly orderNotional: number;
  readonly projectedPositionNotional: number;
  readonly projectedGrossExposure: number;
  readonly projectedNetExposure: number;
  readonly dailyLoss: number;
  readonly requestId?: string;
  readonly idempotencyKey?: string;
}

export interface SubmitOrderResult {
  readonly admitted: boolean;
  readonly order: Order;
  readonly state: TradingCoreState;
  readonly reason?: string;
}

export interface CancelOrderCommand {
  readonly principal: ApplicationPrincipal;
  readonly accountId: string;
  readonly orderId: string;
  readonly requestId?: string;
  readonly idempotencyKey?: string;
}

export interface CancelOrderResult {
  readonly order: Order;
  readonly state: TradingCoreState;
}

export interface CompleteOrderCancellationCommand {
  readonly principal: ApplicationPrincipal;
  readonly accountId: string;
  readonly orderId: string;
  readonly requestId?: string;
  readonly idempotencyKey?: string;
}

export interface GetOrderQuery {
  readonly principal: ApplicationPrincipal;
  readonly accountId: string;
  readonly orderId: string;
}

export interface GetTradingContextQuery {
  readonly principal: ApplicationPrincipal;
  readonly accountId: string;
}

export interface GetOrderResult {
  readonly order: Order;
  readonly state: TradingCoreState;
}

export interface ListOrdersQuery {
  readonly principal: ApplicationPrincipal;
  readonly accountId: string;
}

export interface ListOrdersResult {
  readonly orders: readonly GetOrderResult[];
}

export interface GetTradingContextResult {
  readonly context: TradingContext;
}


export interface MarketDataStatePort {
  get(instrumentId: InstrumentId): import("@tradeledger/domain").MarketDataState | undefined;
  accept(
    instrumentId: InstrumentId,
    data: import("@tradeledger/domain").MarketDataPoint,
    receivedAt: string,
  ): import("@tradeledger/domain").MarketDataState;
  list(): readonly import("@tradeledger/domain").MarketDataState[];
}


export interface RecordExecutionCommand {
  readonly principal: ApplicationPrincipal;
  readonly accountId: string;
  readonly orderId: string;
  readonly executionId: string;
  readonly instrumentId: string;
  readonly side: "buy" | "sell";
  readonly quantity: number;
  readonly price: number;
  readonly executedAt: string;
  readonly commission: number;
  readonly requestId?: string;
  readonly idempotencyKey?: string;
}

export interface RecordExecutionResult {
  readonly applied: boolean;
  readonly duplicate: boolean;
  readonly order: Order;
  readonly state: TradingCoreState;
}

export interface CompetitionPersistenceSnapshot {
  readonly competition: import("@tradeledger/domain").Competition;
  readonly policy: import("@tradeledger/domain").CompetitionPolicy;
  readonly engine: import("@tradeledger/domain").CompetitionEngineState;
  readonly audit: readonly import("@tradeledger/domain").CompetitionAuditEvent[];
  readonly eventSequence: number;
  readonly events: readonly CompetitionEvent[];
  readonly idempotency: import("@tradeledger/domain").IdempotencyState;
}

export interface CompetitionPersistencePort {
  load(): CompetitionPersistenceSnapshot | undefined;
  save(snapshot: CompetitionPersistenceSnapshot): void;
}

export type CompetitionEventType =
  | "competition.created"
  | "competition.prepared"
  | "competition.started"
  | "competition.paused"
  | "competition.resumed"
  | "competition.halted"
  | "competition.completed"
  | "participant.registered"
  | "participant.suspended"
  | "participant.resumed"
  | "participant.liquidation.requested"
  | "competition.policy.updated"
  | "competition.order.authorized"
  | "competition.order.rejected"
  | "competition.performance.updated";

export interface CompetitionEvent {
  readonly eventId: string;
  readonly type: CompetitionEventType;
  readonly occurredAt: string;
  readonly competitionId: string;
  readonly sequence: number;
  readonly targetId: string;
  readonly requestId?: string;
  readonly payload: Readonly<Record<string, string | number | boolean>>;
}

export interface CompetitionEventStreamPort {
  publish(event: CompetitionEvent): void;
  latestSequence(): number;
  subscribe(subscriber: (event: CompetitionEvent) => void): () => void;
  listAfterSequence(sequence: number): readonly CompetitionEvent[];
}

