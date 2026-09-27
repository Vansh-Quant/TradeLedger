import { describe, expect, it } from "vitest";
import {
  admitOrder,
  createBuyingPower,
  createOrder,
  createRiskLimits,
  type InstrumentId,
} from "../../core/domain/src/index.js";

const instrumentId = "AAPL" as InstrumentId;

function makeOrder() {
  return createOrder({
    id: "ORD-001",
    accountId: "ACC-001",
    instrumentId,
    side: "buy",
    type: "limit",
    quantity: 10,
    limitPrice: 100,
    timeInForce: "day",
    createdAt: "2026-09-27T10:00:00Z",
  });
}

function makeInput(overrides: Partial<Parameters<typeof admitOrder>[0]> = {}) {
  return {
    order: makeOrder(),
    orderNotional: 1_000,
    projectedPositionNotional: 5_000,
    projectedGrossExposure: 8_000,
    projectedNetExposure: 5_000,
    dailyLoss: 100,
    buyingPower: createBuyingPower(10_000),
    riskLimits: createRiskLimits({
      maxOrderNotional: 2_000,
      maxPositionNotional: 10_000,
      maxGrossExposure: 20_000,
      maxNetExposure: 10_000,
      maxDailyLoss: 1_000,
    }),
    ...overrides,
  };
}

describe("Order admission and risk workflow", () => {
  it("admits a valid order and reserves its notional", () => {
    const result = admitOrder(makeInput());
    expect(result.admitted).toBe(true);
    expect(result.buyingPower.reservedCapacity).toBe(1_000);
  });

  it("rejects an order above the order-notional limit", () => {
    const result = admitOrder(makeInput({ orderNotional: 2_001 }));
    expect(result.admitted).toBe(false);
    expect(result.reason).toContain("order notional exceeds");
    expect(result.buyingPower.reservedCapacity).toBe(0);
  });

  it("rejects a projected position above its limit", () => {
    const result = admitOrder(makeInput({ projectedPositionNotional: 10_001 }));
    expect(result.admitted).toBe(false);
    expect(result.reason).toContain("position notional exceeds");
  });

  it("rejects projected gross or net exposure breaches", () => {
    expect(admitOrder(makeInput({ projectedGrossExposure: 20_001 })).admitted).toBe(false);
    expect(admitOrder(makeInput({ projectedNetExposure: 10_001 })).admitted).toBe(false);
  });

  it("rejects when daily loss exceeds its boundary", () => {
    const result = admitOrder(makeInput({ dailyLoss: 1_001 }));
    expect(result.admitted).toBe(false);
    expect(result.reason).toContain("daily loss exceeds");
  });

  it("rejects when buying power is insufficient", () => {
    const result = admitOrder(makeInput({ buyingPower: createBuyingPower(999) }));
    expect(result.admitted).toBe(false);
    expect(result.reason).toBe("order notional exceeds available buying power");
  });

  it("does not reserve buying power when admission fails", () => {
    const buyingPower = createBuyingPower(10_000);
    const result = admitOrder(makeInput({ buyingPower, projectedGrossExposure: 20_001 }));
    expect(result.admitted).toBe(false);
    expect(result.buyingPower).toBe(buyingPower);
    expect(result.buyingPower.reservedCapacity).toBe(0);
  });

  it("does not mutate the Order during admission", () => {
    const order = makeOrder();
    const result = admitOrder(makeInput({ order }));
    expect(result.admitted).toBe(true);
    expect(order.status).toBe("created");
    expect(order.quantity).toBe(10);
  });

  it("rejects invalid order notional", () => {
    expect(() => admitOrder(makeInput({ orderNotional: Number.NaN }))).toThrow(
      "orderNotional must be a positive finite number",
    );
  });
});
