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
}

export interface CancelOrderResult {
  readonly order: Order;
  readonly state: TradingCoreState;
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
