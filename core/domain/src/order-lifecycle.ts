import type { Order, OrderStatus } from "./order.js";

const TERMINAL_STATUSES = new Set<OrderStatus>(["filled", "cancelled", "rejected", "expired"]);

const ALLOWED_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  created: ["submitted", "cancelled", "rejected", "expired"],
  submitted: ["acknowledged", "cancel_requested", "rejected", "expired"],
  acknowledged: ["partially_filled", "filled", "cancel_requested", "rejected", "expired"],
  partially_filled: ["filled", "cancel_requested", "expired"],
  filled: [],
  cancel_requested: ["cancelled", "filled"],
  cancelled: [],
  rejected: [],
  expired: [],
};

function assertOrderConsistency(order: Order): void {
  if (!Number.isFinite(order.quantity) || order.quantity <= 0) {
    throw new Error("order quantity must be a finite positive number");
  }
  if (!Number.isFinite(order.filledQuantity) || order.filledQuantity < 0) {
    throw new Error("order filledQuantity must be finite and non-negative");
  }
  if (order.filledQuantity > order.quantity) {
    throw new Error("order filledQuantity cannot exceed quantity");
  }
  if (order.status === "filled" && order.filledQuantity !== order.quantity) {
    throw new Error("filled order must have filledQuantity equal to quantity");
  }
  if (order.status === "created" && order.filledQuantity !== 0) {
    throw new Error("created order must have zero filledQuantity");
  }
}

function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new Error("cannot transition order from " + from + " to " + to);
  }
}

export function transitionOrder(order: Order, nextStatus: OrderStatus): Order {
  assertOrderConsistency(order);
  assertTransition(order.status, nextStatus);
  return Object.freeze({ ...order, status: nextStatus });
}

export function recordOrderFill(order: Order, fillQuantity: number): Order {
  assertOrderConsistency(order);
  if (!Number.isFinite(fillQuantity) || fillQuantity <= 0) {
    throw new Error("fillQuantity must be a finite positive number");
  }
  if (TERMINAL_STATUSES.has(order.status)) {
    throw new Error("cannot fill order from terminal status " + order.status);
  }
  const remainingQuantity = order.quantity - order.filledQuantity;
  if (fillQuantity > remainingQuantity) {
    throw new Error("fillQuantity cannot exceed remaining order quantity");
  }
  if (order.timeInForce === "fok" && fillQuantity !== remainingQuantity) {
    throw new Error("fok order requires a complete fill");
  }
  if (order.status !== "acknowledged" && order.status !== "partially_filled" && order.status !== "cancel_requested") {
    throw new Error("cannot record fill for order from status " + order.status);
  }
  const filledQuantity = order.filledQuantity + fillQuantity;
  return Object.freeze({
    ...order,
    filledQuantity,
    status: filledQuantity === order.quantity ? "filled" : "partially_filled",
  });
}