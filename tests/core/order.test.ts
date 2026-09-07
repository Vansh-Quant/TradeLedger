import { describe, expect, it } from "vitest";
import type { InstrumentId } from "../../core/domain/src/instrument.js";
import { createOrder } from "../../core/domain/src/order.js";

const instrumentId = "BTC-USD" as InstrumentId;

const baseOrder = {
  id: "order-001",
  accountId: "account-001",
  instrumentId,
  side: "buy" as const,
  type: "market" as const,
  quantity: 0.5,
  timeInForce: "gtc" as const,
  createdAt: "2026-09-07T12:00:00.000Z",
};

describe("createOrder", () => {
  it("creates a valid market order", () => {
    const order = createOrder(baseOrder);

    expect(order.type).toBe("market");
    expect(order.status).toBe("created");
    expect(order.quantity).toBe(0.5);
    expect(Object.isFrozen(order)).toBe(true);
  });

  it("creates valid limit, stop, and stop-limit orders", () => {
    expect(createOrder({
      ...baseOrder,
      type: "limit",
      limitPrice: 67000,
    }).limitPrice).toBe(67000);

    expect(createOrder({
      ...baseOrder,
      type: "stop",
      stopPrice: 68000,
    }).stopPrice).toBe(68000);

    const stopLimit = createOrder({
      ...baseOrder,
      type: "stop-limit",
      stopPrice: 68000,
      limitPrice: 68100,
    });

    expect(stopLimit.stopPrice).toBe(68000);
    expect(stopLimit.limitPrice).toBe(68100);
  });

  it("rejects missing required prices", () => {
    expect(() => createOrder({ ...baseOrder, type: "limit" })).toThrow(
      "limit orders require limitPrice and must not have stopPrice",
    );

    expect(() => createOrder({ ...baseOrder, type: "stop" })).toThrow(
      "stop orders require stopPrice and must not have limitPrice",
    );

    expect(() => createOrder({
      ...baseOrder,
      type: "stop-limit",
      limitPrice: 68100,
    })).toThrow("stop-limit orders require both limitPrice and stopPrice");
  });

  it("rejects prices that do not belong to the order type", () => {
    expect(() => createOrder({
      ...baseOrder,
      type: "market",
      limitPrice: 67000,
    })).toThrow("market orders must not have limitPrice or stopPrice");

    expect(() => createOrder({
      ...baseOrder,
      type: "limit",
      limitPrice: 67000,
      stopPrice: 66500,
    })).toThrow("limit orders require limitPrice and must not have stopPrice");

    expect(() => createOrder({
      ...baseOrder,
      type: "stop",
      stopPrice: 68000,
      limitPrice: 68100,
    })).toThrow("stop orders require stopPrice and must not have limitPrice");
  });

  it("rejects invalid identity, quantity, price, and timestamp values", () => {
    expect(() => createOrder({ ...baseOrder, id: " " })).toThrow("id must not be empty");
    expect(() => createOrder({ ...baseOrder, accountId: " " })).toThrow("accountId must not be empty");
    expect(() => createOrder({ ...baseOrder, quantity: 0 })).toThrow(
      "quantity must be a finite positive number",
    );
    expect(() => createOrder({ ...baseOrder, quantity: Number.NaN })).toThrow(
      "quantity must be a finite positive number",
    );
    expect(() => createOrder({
      ...baseOrder,
      type: "limit",
      limitPrice: 0,
    })).toThrow("limitPrice must be a finite positive number");
    expect(() => createOrder({
      ...baseOrder,
      type: "stop",
      stopPrice: Number.POSITIVE_INFINITY,
    })).toThrow("stopPrice must be a finite positive number");
    expect(() => createOrder({ ...baseOrder, createdAt: "not-a-date" })).toThrow(
      "createdAt must be a valid timestamp",
    );
  });

  it("preserves the requested side and time-in-force", () => {
    const order = createOrder({
      ...baseOrder,
      side: "sell",
      type: "limit",
      limitPrice: 67000,
      timeInForce: "ioc",
    });

    expect(order.side).toBe("sell");
    expect(order.timeInForce).toBe("ioc");
  });
});
