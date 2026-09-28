import type { Order, OrderStatus } from "./order.js";

const TERMINAL_STATUSES = new Set<OrderStatus>(["filled", "cancelled", "rejected", "expired"]);

const ALLOWED_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  created: ["submitted", "cancelled", "rejected", "expired"],
  submitted: ["acknowledged", "cancel_requested", "rejected", "expired"],
  acknowledged: ["partially_filled", "filled", "cancel_requested", "rejected", "expired"],
  partially_filled: ["filled", "cancel_requested"],
  filled: [],
  cancel_requested: ["cancelled", "filled"],
  cancelled: [],
  rejected: [],
  expired: [],
};

function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new Error("cannot transition order from " + from + " to " + to);
  }
}

export function transitionOrder(order: Order, nextStatus: OrderStatus): Order {
  assertTransition(order.status, nextStatus);
  return Object.freeze({ ...order, status: nextStatus });
}

export function recordOrderFill(order: Order, fillQuantity: number): Order {
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