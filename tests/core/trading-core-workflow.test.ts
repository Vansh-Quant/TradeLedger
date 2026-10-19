import { describe, expect, it } from "vitest";
import {
  InMemoryExecutionEventStore,
  admitTradingOrder,
  admitTradingOrderWithMarketData,
  createQuote,
  createAccount,
  createAccountPortfolio,
  createExecution,
  createOrder,
  createPortfolio,
  createRiskLimits,
  processTradingExecution,
  requestTradingOrderCancellation,
  completeTradingOrderCancellation,
  type InstrumentId,
  type MarketDataQualityPolicy,
} from "../../core/domain/src/index.js";

const account = createAccount({ id: "ACC-001", baseCurrency: "USD" });
const instrumentId = "AAPL" as InstrumentId;
const riskLimits = createRiskLimits({
  maxOrderNotional: 2_000,
  maxPositionNotional: 5_000,
  maxGrossExposure: 10_000,
  maxNetExposure: 8_000,
  maxDailyLoss: 500,
});

function makeOrder(quantity = 10, limitPrice = 100) {
  return createOrder({
    id: "ORD-001",
    accountId: account.id,
    instrumentId,
    side: "buy",
    type: "limit",
    quantity,
    limitPrice,
    timeInForce: "day",
    createdAt: "2026-10-01T10:00:00Z",
  });
}

function makeAdmission(overrides: Partial<{
  orderNotional: number;
  projectedPositionNotional: number;
  projectedGrossExposure: number;
  projectedNetExposure: number;
  dailyLoss: number;
  totalCapacity: number;
}> = {}) {
  const order = makeOrder();
  const accountPortfolio = createAccountPortfolio(account, createPortfolio());

  return admitTradingOrder({
    order,
    accountPortfolio,
    buyingPower: {
      totalCapacity: overrides.totalCapacity ?? 5_000,
      reservedCapacity: 0,
    },
    riskLimits,
    orderNotional: overrides.orderNotional ?? 1_000,
    projectedPositionNotional: overrides.projectedPositionNotional ?? 1_000,
    projectedGrossExposure: overrides.projectedGrossExposure ?? 1_000,
    projectedNetExposure: overrides.projectedNetExposure ?? 1_000,
    dailyLoss: overrides.dailyLoss ?? 0,
  });
}

function makeExecution(id: string, quantity: number) {
  return createExecution({
    id,
    orderId: "ORD-001",
    instrumentId,
    side: "buy",
    quantity,
    price: 100,
    executedAt: "2026-10-01T10:01:00Z",
    commission: 1,
  });
}

describe("trading core workflow", () => {
  it("admits an order and moves it into acknowledged state", () => {
    const result = makeAdmission();

    expect(result.admitted).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.state.order.status).toBe("acknowledged");
    expect(result.state.order.filledQuantity).toBe(0);
    expect(result.state.buyingPower.reservedCapacity).toBe(1_000);
    expect(result.state.reservation?.remainingAmount).toBe(1_000);
    expect(result.state.reconciliation.order.status).toBe("acknowledged");
  });

  it("rejects before reserving buying power when risk fails", () => {
    const result = makeAdmission({ orderNotional: 2_001 });

    expect(result.admitted).toBe(false);
    expect(result.reason).toContain("order notional");
    expect(result.state.order.status).toBe("rejected");
    expect(result.state.buyingPower.reservedCapacity).toBe(0);
  });

  it("rejects before reserving buying power when capacity fails", () => {
    const result = makeAdmission({ orderNotional: 1_500, totalCapacity: 1_000 });

    expect(result.admitted).toBe(false);
    expect(result.reason).toContain("buying power");
    expect(result.state.order.status).toBe("rejected");
    expect(result.state.buyingPower.reservedCapacity).toBe(0);
  });

  it("processes a fill through the existing reconciliation pipeline", () => {
    const admitted = makeAdmission();
    const eventStore = new InMemoryExecutionEventStore();

    const result = processTradingExecution({
      state: admitted.state,
      execution: makeExecution("EXE-001", 4),
      eventStore,
      eventId: "EVT-001",
      recordedAt: "2026-10-01T10:02:00Z",
    });

    expect(result.applied).toBe(true);
    expect(result.duplicate).toBe(false);
    expect(result.state.order.status).toBe("partially_filled");
    expect(result.state.order.filledQuantity).toBe(4);
    expect(result.state.reconciliation.accountPortfolio.portfolio.positions.get("AAPL")?.quantity).toBe(4);
    expect(result.state.buyingPower.reservedCapacity).toBe(600);
    expect(result.state.reservation?.remainingAmount).toBe(600);
    expect(eventStore.hasExecution("EXE-001")).toBe(true);
  });

  it("automatically cancels an IOC remainder after a partial fill", () => {
    const order = createOrder({
      id: "ORD-IOC", accountId: account.id, instrumentId,
      side: "buy", type: "limit", quantity: 10, limitPrice: 100,
      timeInForce: "ioc", createdAt: "2026-10-01T10:00:00Z",
    });
    const admitted = admitTradingOrder({
      order,
      accountPortfolio: createAccountPortfolio(account, createPortfolio()),
      buyingPower: { totalCapacity: 5_000, reservedCapacity: 0 },
      riskLimits,
      orderNotional: 1_000,
      projectedPositionNotional: 1_000,
      projectedGrossExposure: 1_000,
      projectedNetExposure: 1_000,
      dailyLoss: 0,
    });
    const result = processTradingExecution({
      state: admitted.state,
      execution: createExecution({
        id: "EXE-IOC", orderId: order.id, instrumentId,
        side: "buy", quantity: 4, price: 100,
        executedAt: "2026-10-01T10:01:00Z", commission: 1,
      }),
      eventStore: new InMemoryExecutionEventStore(),
      eventId: "EVT-IOC", recordedAt: "2026-10-01T10:02:00Z",
    });

    expect(result.applied).toBe(true);
    expect(result.state.order.status).toBe("cancelled");
    expect(result.state.order.filledQuantity).toBe(4);
    expect(result.state.buyingPower.reservedCapacity).toBe(0);
    expect(result.state.reservation?.remainingAmount).toBe(0);
  });

  it("keeps duplicate execution idempotent at the trading-core boundary", () => {
    const admitted = makeAdmission();
    const eventStore = new InMemoryExecutionEventStore();
    const execution = makeExecution("EXE-001", 4);

    const first = processTradingExecution({
      state: admitted.state,
      execution,
      eventStore,
      eventId: "EVT-001",
      recordedAt: "2026-10-01T10:02:00Z",
    });

    const second = processTradingExecution({
      state: first.state,
      execution,
      eventStore,
      eventId: "EVT-002",
      recordedAt: "2026-10-01T10:03:00Z",
    });

    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.state.order.filledQuantity).toBe(4);
    expect(second.state.reconciliation.accountPortfolio.portfolio.positions.get("AAPL")?.quantity).toBe(4);
    expect(second.state.buyingPower.reservedCapacity).toBe(600);
  });

  it("allows a complete fill through the composed workflow", () => {
    const admitted = makeAdmission();
    const eventStore = new InMemoryExecutionEventStore();

    const result = processTradingExecution({
      state: admitted.state,
      execution: makeExecution("EXE-001", 10),
      eventStore,
      eventId: "EVT-001",
      recordedAt: "2026-10-01T10:02:00Z",
    });

    expect(result.state.order.status).toBe("filled");
    expect(result.state.order.filledQuantity).toBe(10);
    expect(result.state.reconciliation.accountPortfolio.portfolio.positions.get("AAPL")?.quantity).toBe(10);
    expect(result.state.buyingPower.reservedCapacity).toBe(0);
    expect(result.state.reservation?.remainingAmount).toBe(0);
  });
});


  it("keeps a cancellation request separate from reservation release", () => {
    const admitted = makeAdmission();
    const requested = requestTradingOrderCancellation(admitted.state);

    expect(requested.order.status).toBe("cancel_requested");
    expect(requested.buyingPower.reservedCapacity).toBe(1_000);
    expect(requested.reservation?.remainingAmount).toBe(1_000);
  });

  it("releases remaining reservation when cancellation completes", () => {
    const admitted = makeAdmission();
    const requested = requestTradingOrderCancellation(admitted.state);
    const cancelled = completeTradingOrderCancellation(requested);

    expect(cancelled.order.status).toBe("cancelled");
    expect(cancelled.buyingPower.reservedCapacity).toBe(0);
    expect(cancelled.reservation?.remainingAmount).toBe(0);
  });

  it("releases only the unfilled reservation after a partial fill is cancelled", () => {
    const admitted = makeAdmission();
    const eventStore = new InMemoryExecutionEventStore();

    const partiallyFilled = processTradingExecution({
      state: admitted.state,
      execution: makeExecution("EXE-001", 4),
      eventStore,
      eventId: "EVT-001",
      recordedAt: "2026-10-01T10:02:00Z",
    });

    const requested = requestTradingOrderCancellation(partiallyFilled.state);
    const cancelled = completeTradingOrderCancellation(requested);

    expect(cancelled.order.status).toBe("cancelled");
    expect(cancelled.order.filledQuantity).toBe(4);
    expect(cancelled.buyingPower.reservedCapacity).toBe(0);
    expect(cancelled.reservation?.remainingAmount).toBe(0);
  });


const quotePolicy: MarketDataQualityPolicy = {
  maxAgeMs: 2_000,
  maxSpreadBps: 30,
  maxFutureSkewMs: 250,
};

function makeMarketDataAdmission(
  quote: Parameters<typeof admitTradingOrderWithMarketData>[0]["quote"],
  now = "2026-10-01T10:00:01.000Z",
  policy = quotePolicy,
) {
  return admitTradingOrderWithMarketData({
    order: makeOrder(),
    accountPortfolio: createAccountPortfolio(account, createPortfolio()),
    buyingPower: { totalCapacity: 5_000, reservedCapacity: 0 },
    riskLimits,
    orderNotional: 1_000,
    projectedPositionNotional: 1_000,
    projectedGrossExposure: 1_000,
    projectedNetExposure: 1_000,
    dailyLoss: 0,
    quote,
    now,
    marketDataQualityPolicy: policy,
  });
}

function makeFreshQuote(overrides: Partial<Parameters<typeof createQuote>[0]> = {}) {
  return createQuote({
    instrumentId,
    bid: 99.9,
    bidSize: 10,
    ask: 100.1,
    askSize: 10,
    observedAt: "2026-10-01T10:00:00.000Z",
    source: "test-feed",
    ...overrides,
  });
}

describe("market-data-enforced trading admission", () => {
  it("admits only when the matching quote is fresh and within spread policy", () => {
    const result = makeMarketDataAdmission(makeFreshQuote());

    expect(result.admitted).toBe(true);
    expect(result.marketDataQuality.usable).toBe(true);
    expect(result.state.order.status).toBe("acknowledged");
    expect(result.state.buyingPower.reservedCapacity).toBe(1_000);
  });

  it("fails closed for missing quotes without reserving buying power", () => {
    const result = makeMarketDataAdmission(null);

    expect(result.admitted).toBe(false);
    expect(result.marketDataQuality.status).toBe("missing");
    expect(result.reason).toContain("quote is missing");
    expect(result.state.order.status).toBe("rejected");
    expect(result.state.buyingPower.reservedCapacity).toBe(0);
  });

  it("rejects stale quotes before order admission", () => {
    const result = makeMarketDataAdmission(
      makeFreshQuote(),
      "2026-10-01T10:00:05.000Z",
    );

    expect(result.admitted).toBe(false);
    expect(result.marketDataQuality.status).toBe("stale");
    expect(result.state.order.status).toBe("rejected");
    expect(result.state.buyingPower.reservedCapacity).toBe(0);
  });

  it("rejects quotes for a different instrument", () => {
    const result = makeMarketDataAdmission(
      makeFreshQuote({ instrumentId: "MSFT" as InstrumentId }),
    );

    expect(result.admitted).toBe(false);
    expect(result.qualityRejectionReason).toBe("quote instrument does not match order instrument");
    expect(result.state.order.status).toBe("rejected");
    expect(result.state.buyingPower.reservedCapacity).toBe(0);
  });

  it("rejects a fresh quote with a spread outside policy", () => {
    const result = makeMarketDataAdmission(makeFreshQuote({ bid: 99, ask: 101 }));

    expect(result.admitted).toBe(false);
    expect(result.marketDataQuality.status).toBe("wide-spread");
    expect(result.state.order.status).toBe("rejected");
    expect(result.state.buyingPower.reservedCapacity).toBe(0);
  });
});
