import { describe, expect, it } from "vitest";
import { orderTypeRequiresPricing } from "@/lib/order-admission";

describe("order type admission", () => {
  it("marks market and stop orders as requiring pricing", () => {
    expect(orderTypeRequiresPricing("MARKET")).toBe(true);
    expect(orderTypeRequiresPricing("STOP")).toBe(true);
  });

  it("allows limit and stop-limit orders, which carry a limit price", () => {
    expect(orderTypeRequiresPricing("LIMIT")).toBe(false);
    expect(orderTypeRequiresPricing("STOP_LIMIT")).toBe(false);
  });
});
