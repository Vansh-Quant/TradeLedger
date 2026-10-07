import { describe, expect, it } from "vitest";
import { createOrder, isDayOrderExpired, type InstrumentId } from "../../core/domain/src/index.js";

function order(timeInForce: "day" | "gtc") {
  return createOrder({
    id: "ORD-EXPIRY",
    accountId: "ACC-1",
    instrumentId: "AAPL" as InstrumentId,
    side: "buy",
    type: "market",
    quantity: 1,
    timeInForce,
    createdAt: "2026-10-07T14:00:00Z",
  });
}

describe("order expiry policy", () => {
  it("expires DAY orders at or after session close", () => {
    expect(isDayOrderExpired(order("day"), {
      now: "2026-10-07T15:59:59Z",
      sessionClose: "2026-10-07T16:00:00Z",
    })).toBe(false);
    expect(isDayOrderExpired(order("day"), {
      now: "2026-10-07T16:00:00Z",
      sessionClose: "2026-10-07T16:00:00Z",
    })).toBe(true);
  });

  it("does not automatically expire GTC orders", () => {
    expect(isDayOrderExpired(order("gtc"), {
      now: "2027-01-01T00:00:00Z",
      sessionClose: "2026-10-07T16:00:00Z",
    })).toBe(false);
  });

  it("rejects invalid expiry timestamps", () => {
    expect(() => isDayOrderExpired(order("day"), {
      now: "not-a-date",
      sessionClose: "2026-10-07T16:00:00Z",
    })).toThrow("now must be a valid timestamp");
  });
});
