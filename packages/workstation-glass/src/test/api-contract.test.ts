import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/config", () => ({
  getApiConfig: () => ({ baseUrl: "http://api.test", token: "test-token", accountId: "ACC-APP" }),
  isConfigured: () => true,
  useApiConfig: () => ({ baseUrl: "http://api.test", token: "test-token", accountId: "ACC-APP" }),
}));

import { api } from "@/api/client";


// Payloads below mirror `packages/api/src/server.ts`: it serialises application
// results with `jsonSafe` (Maps become arrays) and wraps responses in the
// application result object. They are the contract, not a fixture convention.

const accountContextPayload = {
  context: {
    accountId: "ACC-APP",
    accountPortfolio: {
      accountId: "ACC-APP",
      portfolio: {
        // Portfolio.positions is a ReadonlyMap; jsonSafe emits its values.
        positions: [
          { instrumentId: "AAPL", quantity: 80, averagePrice: 100.25, realizedPnl: 0, side: "long" },
          { instrumentId: "NVDA", quantity: -20, averagePrice: 151.2, realizedPnl: 18.4, side: "short" },
        ],
        realizedPnl: 625.35,
        unrealizedPnl: -12.5,
        marketValue: 21128.5,
        netExposure: 13642.25,
        grossExposure: 21128.5,
      },
    },
    buyingPower: { totalCapacity: 100_000, reservedCapacity: 0 },
    riskLimits: {
      maxOrderNotional: 50_000,
      maxPositionNotional: 100_000,
      maxGrossExposure: 200_000,
      maxNetExposure: 150_000,
      maxDailyLoss: 5_000,
    },
  },
};

const orderState = {
  order: {
    id: "ORD-1",
    accountId: "ACC-APP",
    instrumentId: "AAPL",
    side: "buy",
    type: "limit",
    quantity: 25,
    filledQuantity: 0,
    limitPrice: 103.5,
    timeInForce: "day",
    status: "submitted",
    createdAt: "2026-10-06T14:18:00.000Z",
  },
  buyingPower: { totalCapacity: 100_000, reservedCapacity: 2_587.5 },
  reconciliation: { executions: [], filledQuantity: 0, status: "pending" },
};

let fetchMock: ReturnType<typeof vi.fn>;

function respondWith(payload: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } }),
  );
}

describe("workstation API contract", () => {
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("maps the authorised trading-context payload onto the view model", async () => {
    respondWith(accountContextPayload);

    const ctx = await api.accountContext("ACC-APP");

    expect(ctx.accountId).toBe("ACC-APP");
    // Available on TradingContext.
    expect(ctx.buyingPower).toBe(100_000);
    expect(ctx.realizedPnl).toBe(625.35);
    expect(ctx.unrealizedPnl).toBe(-12.5);
    expect(ctx.marketValue).toBe(21128.5);
    expect(ctx.grossExposure).toBe(21128.5);
    expect(ctx.netExposure).toBe(13642.25);
    // RiskLimits live under context.riskLimits.
    expect(ctx.limits).toEqual({
      maxOrderNotional: 50_000,
      maxPositionNotional: 100_000,
      maxGrossExposure: 200_000,
      maxNetExposure: 150_000,
      maxDailyLoss: 5_000,
    });
    // Positions arrive as an array of domain positions keyed by instrumentId.
    expect(ctx.positions).toHaveLength(2);
    expect(ctx.positions[0]?.symbol).toBe("AAPL");
    expect(ctx.positions[0]?.quantity).toBe(80);
    expect(ctx.positions[0]?.averagePrice).toBe(100.25);
    expect(ctx.positions[1]?.symbol).toBe("NVDA");
    expect(ctx.positions[1]?.quantity).toBe(-20);
    // Not part of TradingContext: must stay absent rather than be invented.
    expect(ctx.totalEquity).toBeUndefined();
    expect(ctx.cash).toBeUndefined();
    expect(ctx.dailyPnl).toBeUndefined();
    expect(ctx.dailyLoss).toBeUndefined();
  });

  it("unwraps the { orders: [{ order, state }] } listing envelope", async () => {
    respondWith({ orders: [orderState, orderState] });

    const orders = await api.orders("ACC-APP");

    expect(orders).toHaveLength(2);
    expect(orders[0]).toMatchObject({
      orderId: "ORD-1",
      symbol: "AAPL",
      side: "BUY",
      type: "LIMIT",
      quantity: 25,
      filledQuantity: 0,
      limitPrice: 103.5,
      timeInForce: "DAY",
      status: "SUBMITTED",
      createdAt: "2026-10-06T14:18:00.000Z",
    });
    expect(orders[0]?.orderId).not.toBe("—");
  });

  it("sends the domain order command with lowercase enums and instrumentId", async () => {
    respondWith({ admitted: true, order: orderState.order, state: orderState }, 201);

    await api.submitOrder({
      accountId: "ACC-APP",
      symbol: "AAPL",
      side: "BUY",
      type: "LIMIT",
      quantity: 25,
      limitPrice: 103.5,
      timeInForce: "DAY",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      accountId: "ACC-APP",
      instrumentId: "AAPL",
      side: "buy",
      type: "limit",
      quantity: 25,
      limitPrice: 103.5,
      timeInForce: "day",
    });
  });

  it("reads ingested market-data states from the { states } envelope", async () => {
    respondWith({
      states: [
        {
          instrumentId: "AAPL",
          latestQuote: {
            kind: "quote",
            instrumentId: "AAPL",
            bid: 100,
            bidSize: 100,
            ask: 100.25,
            askSize: 100,
            observedAt: "2026-10-04T09:30:00Z",
            source: "dev-feed",
          },
          lastSequence: 1,
          lastObservedAt: "2026-10-04T09:30:00Z",
          lastReceivedAt: "2026-10-04T09:30:00Z",
        },
      ],
    });

    const states = await api.marketData("ACC-APP");

    expect(states).toHaveLength(1);
    expect(states[0]?.instrumentId).toBe("AAPL");
    expect(states[0]?.latestQuote).toMatchObject({ bid: 100, ask: 100.25, source: "dev-feed" });
    expect(states[0]?.latestQuote?.observedAt).toBe("2026-10-04T09:30:00Z");
  });

  it("keeps the flat workstation demo context readable", async () => {
    respondWith({
      accountId: "ACC-APP",
      asOf: "2026-10-06T14:30:00Z",
      context: {
        accountId: "ACC-APP",
        totalEquity: 103_842.75,
        buyingPower: 100_000,
        grossExposure: 21_128.5,
        limits: { maxOrderNotional: 50_000 },
        positions: [{ symbol: "AAPL", quantity: 80, averagePrice: 100.25 }],
      },
    });

    const demo = await api.workstationDemo("ACC-APP");

    expect(demo.context.totalEquity).toBe(103_842.75);
    expect(demo.context.buyingPower).toBe(100_000);
    expect(demo.context.limits.maxOrderNotional).toBe(50_000);
    expect(demo.context.positions[0]?.symbol).toBe("AAPL");
  });

  it("leaves absent backend values undefined instead of defaulting to zero", async () => {
    respondWith({ context: { accountId: "ACC-APP" } });

    const ctx = await api.accountContext("ACC-APP");

    expect(ctx.positions).toEqual([]);
    expect(ctx.buyingPower).toBeUndefined();
    expect(ctx.limits.maxDailyLoss).toBeUndefined();
    expect(ctx.grossExposure).toBeUndefined();
  });

  it("maps STOP_LIMIT to the backend's stop-limit enum", async () => {
    respondWith({ admitted: true, order: orderState.order, state: orderState }, 201);

    await api.submitOrder({
      accountId: "ACC-APP",
      symbol: "AAPL",
      side: "SELL",
      type: "STOP_LIMIT",
      quantity: 10,
      limitPrice: 99,
      stopPrice: 100,
      timeInForce: "GTC",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      side: "sell",
      type: "stop-limit",
      timeInForce: "gtc",
      stopPrice: 100,
    });
  });
});
