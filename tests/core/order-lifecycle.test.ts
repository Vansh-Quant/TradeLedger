import { describe, expect, it } from "vitest";
import { createOrder } from "../../core/domain/src/order.js";
import { recordOrderFill, transitionOrder } from "../../core/domain/src/order-lifecycle.js";
import type { InstrumentId } from "../../core/domain/src/instrument.js";

const baseOrder = createOrder({
  id: "ORD-001", accountId: "ACC-001", instrumentId: "AAPL" as InstrumentId,
  side: "buy", type: "limit", quantity: 10, limitPrice: 100,
  timeInForce: "day", createdAt: "2026-09-28T10:00:00Z",
});

function acknowledgedOrder() {
  return transitionOrder(transitionOrder(baseOrder, "submitted"), "acknowledged");
}

describe("order lifecycle", () => {
  it("allows valid submission and acknowledgement transitions", () => {
    const order = acknowledgedOrder();
    expect(order.status).toBe("acknowledged");
    expect(order.filledQuantity).toBe(0);
  });

  it("rejects invalid lifecycle transitions", () => {
    expect(() => transitionOrder(baseOrder, "filled")).toThrow("cannot transition order from created to filled");
    expect(() => transitionOrder(baseOrder, "acknowledged")).toThrow("cannot transition order from created to acknowledged");
  });

  it("supports partial then full fills", () => {
    const partial = recordOrderFill(acknowledgedOrder(), 4);
    const filled = recordOrderFill(partial, 6);
    expect(partial.status).toBe("partially_filled");
    expect(partial.filledQuantity).toBe(4);
    expect(filled.status).toBe("filled");
    expect(filled.filledQuantity).toBe(10);
  });

  it("rejects overfills and invalid fill quantities", () => {
    const order = acknowledgedOrder();
    expect(() => recordOrderFill(order, 11)).toThrow("fillQuantity cannot exceed remaining order quantity");
    expect(() => recordOrderFill(order, 0)).toThrow("fillQuantity must be a finite positive number");
    expect(() => recordOrderFill(order, Number.NaN)).toThrow("fillQuantity must be a finite positive number");
  });

  it("rejects inconsistent hydrated order state before transition", () => {
    const inconsistent = Object.freeze({ ...acknowledgedOrder(), filledQuantity: 11 });
    expect(() => transitionOrder(inconsistent, "cancel_requested")).toThrow("order filledQuantity cannot exceed quantity");
  });

  it("rejects a filled status without a complete fill", () => {
    const inconsistent = Object.freeze({ ...acknowledgedOrder(), status: "filled" as const });
    expect(() => transitionOrder(inconsistent, "cancel_requested")).toThrow("filled order must have filledQuantity equal to quantity");
  });

  it("supports cancellation request and cancellation", () => {
    const requested = transitionOrder(acknowledgedOrder(), "cancel_requested");
    const cancelled = transitionOrder(requested, "cancelled");
    expect(cancelled.status).toBe("cancelled");
  });

  it("allows a cancel-requested order to finish if a fill races the cancellation", () => {
    const filled = recordOrderFill(transitionOrder(acknowledgedOrder(), "cancel_requested"), 10);
    expect(filled.status).toBe("filled");
  });

  it("keeps lifecycle updates immutable and blocks terminal transitions", () => {
    const submitted = transitionOrder(baseOrder, "submitted");
    expect(baseOrder.status).toBe("created");
    expect(submitted).not.toBe(baseOrder);
    const rejected = transitionOrder(baseOrder, "rejected");
    expect(() => transitionOrder(rejected, "submitted")).toThrow("cannot transition order from rejected to submitted");
  });
});