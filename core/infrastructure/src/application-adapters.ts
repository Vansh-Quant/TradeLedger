import type {
  AccountId,
  AccountPortfolio,
  BuyingPower,
  InstrumentId,
  Order,
  OrderStatus,
  RiskLimits,
  TradingCoreState,
} from "@tradeledger/domain";
import { createBuyingPower, createPosition, createPortfolio, createRiskLimits, setPosition } from "@tradeledger/domain";
import type {
  OrderStatePort,
  TradingContext,
  TradingContextPort,
} from "@tradeledger/application";
import { DurableJsonStore, PersistenceError, type JsonCodec } from "./durable-json-store.js";

const ORDER_STATUSES = new Set<OrderStatus>([
  "created",
  "submitted",
  "acknowledged",
  "partially_filled",
  "filled",
  "cancel_requested",
  "cancelled",
  "rejected",
  "expired",
]);

function objectRecord(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new PersistenceError(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringField(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new PersistenceError(`${field} must be a non-empty string`);
  }
  return value;
}

function finiteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new PersistenceError(`${field} must be a finite number`);
  }
  return value;
}

function positiveNumber(value: unknown, field: string): number {
  const result = finiteNumber(value, field);
  if (result <= 0) throw new PersistenceError(`${field} must be positive`);
  return result;
}

function nonNegativeNumber(value: unknown, field: string): number {
  const result = finiteNumber(value, field);
  if (result < 0) throw new PersistenceError(`${field} must be non-negative`);
  return result;
}

function optionalPositiveNumber(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  return positiveNumber(value, field);
}

function timestamp(value: unknown, field: string): string {
  const result = stringField(value, field);
  if (!Number.isFinite(Date.parse(result))) throw new PersistenceError(`${field} must be a valid timestamp`);
  return result;
}

function validateOrder(value: unknown): Order {
  const raw = objectRecord(value, "order");
  const status = stringField(raw.status, "order.status") as OrderStatus;
  if (!ORDER_STATUSES.has(status)) throw new PersistenceError("order.status is invalid");

  const quantity = positiveNumber(raw.quantity, "order.quantity");
  const filledQuantity = nonNegativeNumber(raw.filledQuantity, "order.filledQuantity");
  if (filledQuantity > quantity) throw new PersistenceError("order.filledQuantity exceeds order.quantity");

  const side = stringField(raw.side, "order.side");
  if (side !== "buy" && side !== "sell") throw new PersistenceError("order.side is invalid");

  const type = stringField(raw.type, "order.type");
  if (type !== "market" && type !== "limit" && type !== "stop" && type !== "stop-limit") {
    throw new PersistenceError("order.type is invalid");
  }

  const timeInForce = stringField(raw.timeInForce, "order.timeInForce");
  if (timeInForce !== "day" && timeInForce !== "gtc" && timeInForce !== "ioc" && timeInForce !== "fok") {
    throw new PersistenceError("order.timeInForce is invalid");
  }

  const limitPrice = optionalPositiveNumber(raw.limitPrice, "order.limitPrice");
  const stopPrice = optionalPositiveNumber(raw.stopPrice, "order.stopPrice");

  if (type === "market" && (limitPrice !== undefined || stopPrice !== undefined)) {
    throw new PersistenceError("market order cannot contain prices");
  }
  if (type === "limit" && (limitPrice === undefined || stopPrice !== undefined)) {
    throw new PersistenceError("limit order price fields are invalid");
  }
  if (type === "stop" && (limitPrice !== undefined || stopPrice === undefined)) {
    throw new PersistenceError("stop order price fields are invalid");
  }
  if (type === "stop-limit" && (limitPrice === undefined || stopPrice === undefined)) {
    throw new PersistenceError("stop-limit order price fields are invalid");
  }

  const order: Order = Object.freeze({
    id: stringField(raw.id, "order.id") as Order["id"],
    accountId: stringField(raw.accountId, "order.accountId") as AccountId,
    instrumentId: stringField(raw.instrumentId, "order.instrumentId") as InstrumentId,
    side,
    type,
    quantity,
    filledQuantity,
    ...(limitPrice === undefined ? {} : { limitPrice }),
    ...(stopPrice === undefined ? {} : { stopPrice }),
    timeInForce,
    status,
    createdAt: timestamp(raw.createdAt, "order.createdAt"),
  });

  return order;
}

function encodeOrderState(state: TradingCoreState): unknown {
  return {
    order: state.order,
    buyingPower: state.buyingPower,
    reservation: state.reservation,
    reconciliation: {
      order: state.reconciliation.order,
      accountPortfolio: encodeAccountPortfolio(state.reconciliation.accountPortfolio),
      appliedExecutionIds: [...state.reconciliation.appliedExecutionIds],
    },
  };
}

function encodeAccountPortfolio(value: AccountPortfolio): unknown {
  return {
    accountId: value.accountId,
    portfolio: {
      positions: [...value.portfolio.positions.values()],
      realizedPnl: value.portfolio.realizedPnl,
      unrealizedPnl: value.portfolio.unrealizedPnl,
      marketValue: value.portfolio.marketValue,
      netExposure: value.portfolio.netExposure,
      grossExposure: value.portfolio.grossExposure,
    },
  };
}

function decodeAccountPortfolio(value: unknown): AccountPortfolio {
  const raw = objectRecord(value, "accountPortfolio");
  const accountId = stringField(raw.accountId, "accountPortfolio.accountId") as AccountId;
  const portfolioRaw = objectRecord(raw.portfolio, "accountPortfolio.portfolio");
  const positionsRaw = portfolioRaw.positions;
  if (!Array.isArray(positionsRaw)) throw new PersistenceError("accountPortfolio.portfolio.positions must be an array");

  let portfolio = createPortfolio();
  for (const positionRaw of positionsRaw) {
    const position = objectRecord(positionRaw, "position");
    const instrumentId = stringField(position.instrumentId, "position.instrumentId");
    const quantity = finiteNumber(position.quantity, "position.quantity");
    const averagePrice = position.averagePrice === undefined
      ? undefined
      : positiveNumber(position.averagePrice, "position.averagePrice");
    const realizedPnl = finiteNumber(position.realizedPnl, "position.realizedPnl");
    const side = stringField(position.side, "position.side");
    if (side !== "long" && side !== "short" && side !== "flat") {
      throw new PersistenceError("position.side is invalid");
    }
    if (quantity === 0 && side !== "flat") throw new PersistenceError("flat quantity must have flat side");
    if (quantity !== 0 && side === "flat") throw new PersistenceError("non-zero quantity cannot be flat");
    if (quantity !== 0 && averagePrice === undefined) throw new PersistenceError("active position requires averagePrice");

    portfolio = setPosition(portfolio, Object.freeze({
      instrumentId,
      quantity,
      averagePrice,
      realizedPnl,
      side,
    }));
  }

  if (finiteNumber(portfolioRaw.realizedPnl, "portfolio.realizedPnl") !== portfolio.realizedPnl) {
    throw new PersistenceError("portfolio.realizedPnl does not match persisted positions");
  }
  if (finiteNumber(portfolioRaw.unrealizedPnl, "portfolio.unrealizedPnl") !== portfolio.unrealizedPnl) {
    throw new PersistenceError("portfolio.unrealizedPnl does not match deterministic portfolio state");
  }
  if (finiteNumber(portfolioRaw.marketValue, "portfolio.marketValue") !== portfolio.marketValue) {
    throw new PersistenceError("portfolio.marketValue does not match persisted positions");
  }
  if (finiteNumber(portfolioRaw.netExposure, "portfolio.netExposure") !== portfolio.netExposure) {
    throw new PersistenceError("portfolio.netExposure does not match persisted positions");
  }
  if (finiteNumber(portfolioRaw.grossExposure, "portfolio.grossExposure") !== portfolio.grossExposure) {
    throw new PersistenceError("portfolio.grossExposure does not match persisted positions");
  }

  return Object.freeze({ accountId, portfolio });
}

function decodeTradingCoreState(value: unknown): TradingCoreState {
  const raw = objectRecord(value, "tradingCoreState");
  const order = validateOrder(raw.order);
  const buyingPowerRaw = objectRecord(raw.buyingPower, "buyingPower");
  const buyingPower = createBuyingPower(
    nonNegativeNumber(buyingPowerRaw.totalCapacity, "buyingPower.totalCapacity"),
    nonNegativeNumber(buyingPowerRaw.reservedCapacity, "buyingPower.reservedCapacity"),
  );

  const reservationRaw = raw.reservation;
  let reservation: TradingCoreState["reservation"];
  if (reservationRaw !== undefined) {
    const reservationObject = objectRecord(reservationRaw, "reservation");
    const initialAmount = positiveNumber(reservationObject.initialAmount, "reservation.initialAmount");
    const remainingAmount = nonNegativeNumber(reservationObject.remainingAmount, "reservation.remainingAmount");
    const quantity = positiveNumber(reservationObject.quantity, "reservation.quantity");
    if (remainingAmount > initialAmount) throw new PersistenceError("reservation.remainingAmount exceeds initialAmount");
    if (stringField(reservationObject.orderId, "reservation.orderId") !== order.id) {
      throw new PersistenceError("reservation.orderId does not match order.id");
    }
    reservation = Object.freeze({
      orderId: order.id,
      initialAmount,
      remainingAmount,
      quantity,
    });
  }

  const reconciliationRaw = objectRecord(raw.reconciliation, "reconciliation");
  const reconciliationOrder = validateOrder(reconciliationRaw.order);
  if (reconciliationOrder.id !== order.id) throw new PersistenceError("reconciliation order does not match state order");
  const accountPortfolio = decodeAccountPortfolio(reconciliationRaw.accountPortfolio);
  if (accountPortfolio.accountId !== order.accountId) throw new PersistenceError("account portfolio does not match order account");
  const ids = reconciliationRaw.appliedExecutionIds;
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || id.trim().length === 0)) {
    throw new PersistenceError("reconciliation.appliedExecutionIds must be an array of non-empty strings");
  }

  return Object.freeze({
    order,
    buyingPower,
    ...(reservation === undefined ? {} : { reservation }),
    reconciliation: Object.freeze({
      order: reconciliationOrder,
      accountPortfolio,
      appliedExecutionIds: new Set(ids),
    }),
  });
}

const orderStateCodec: JsonCodec<TradingCoreState> = {
  encode: encodeOrderState,
  decode: decodeTradingCoreState,
};

const tradingContextCodec: JsonCodec<TradingContext> = {
  encode(value) {
    return {
      accountId: value.accountId,
      accountPortfolio: encodeAccountPortfolio(value.accountPortfolio),
      buyingPower: value.buyingPower,
      riskLimits: value.riskLimits,
    };
  },
  decode(value) {
    const raw = objectRecord(value, "tradingContext");
    const accountId = stringField(raw.accountId, "tradingContext.accountId") as AccountId;
    const accountPortfolio = decodeAccountPortfolio(raw.accountPortfolio);
    if (accountPortfolio.accountId !== accountId) throw new PersistenceError("trading context account mismatch");

    const buyingPowerRaw = objectRecord(raw.buyingPower, "tradingContext.buyingPower");
    const buyingPower = createBuyingPower(
      nonNegativeNumber(buyingPowerRaw.totalCapacity, "buyingPower.totalCapacity"),
      nonNegativeNumber(buyingPowerRaw.reservedCapacity, "buyingPower.reservedCapacity"),
    );

    const riskRaw = objectRecord(raw.riskLimits, "tradingContext.riskLimits");
    const riskLimits: RiskLimits = createRiskLimits({
      maxOrderNotional: positiveNumber(riskRaw.maxOrderNotional, "riskLimits.maxOrderNotional"),
      maxPositionNotional: positiveNumber(riskRaw.maxPositionNotional, "riskLimits.maxPositionNotional"),
      maxGrossExposure: positiveNumber(riskRaw.maxGrossExposure, "riskLimits.maxGrossExposure"),
      maxNetExposure: positiveNumber(riskRaw.maxNetExposure, "riskLimits.maxNetExposure"),
      maxDailyLoss: positiveNumber(riskRaw.maxDailyLoss, "riskLimits.maxDailyLoss"),
    });

    return Object.freeze({ accountId, accountPortfolio, buyingPower, riskLimits });
  },
};

export class DurableOrderStateStore implements OrderStatePort {
  private readonly store: DurableJsonStore<TradingCoreState>;

  constructor(rootDirectory: string) {
    this.store = new DurableJsonStore(rootDirectory, "orders", orderStateCodec);
  }

  save(state: TradingCoreState): void {
    throw new PersistenceError("DurableOrderStateStore requires async persistence; use saveAsync");
  }

  async saveAsync(state: TradingCoreState): Promise<void> {
    await this.store.save(state.order.id, state);
  }

  get(orderId: string): TradingCoreState | undefined {
    throw new PersistenceError("DurableOrderStateStore requires async reads; use getAsync");
  }

  async getAsync(orderId: string): Promise<TradingCoreState | undefined> {
    return this.store.get(orderId);
  }
}

export class DurableTradingContextStore implements TradingContextPort {
  private readonly store: DurableJsonStore<TradingContext>;

  constructor(rootDirectory: string) {
    this.store = new DurableJsonStore(rootDirectory, "contexts", tradingContextCodec);
  }

  getContext(_accountId: AccountId): TradingContext {
    throw new PersistenceError("DurableTradingContextStore requires async persistence; use getContextAsync");
  }

  async getContextAsync(accountId: AccountId): Promise<TradingContext> {
    const context = await this.store.get(accountId);
    if (context === undefined) throw new PersistenceError(`trading context ${accountId} was not found`);
    return context;
  }

  saveContext(_context: TradingContext): void {
    throw new PersistenceError("DurableTradingContextStore requires async persistence; use saveContextAsync");
  }

  async saveContextAsync(context: TradingContext): Promise<void> {
    await this.store.save(context.accountId, context);
  }
}

export function getOrderStateCodecForTests(): JsonCodec<TradingCoreState> {
  return orderStateCodec;
}
