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
  | "order.read";

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
  execute<T>(
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

export interface GetOrderResult {
  readonly order: Order;
  readonly state: TradingCoreState;
}
