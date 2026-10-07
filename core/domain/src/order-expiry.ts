import type { Order } from "./order.js";

export interface OrderExpiryContext {
  readonly now: string;
  readonly sessionClose: string;
}

/**
 * DAY orders expire once the configured trading session closes.
 * GTC orders have no automatic expiry at this boundary.
 * IOC/FOK semantics are handled by execution workflow.
 */
export function isDayOrderExpired(
  order: Order,
  context: OrderExpiryContext,
): boolean {
  if (order.timeInForce !== "day") return false;

  const now = Date.parse(context.now);
  const sessionClose = Date.parse(context.sessionClose);

  if (!Number.isFinite(now)) throw new Error("now must be a valid timestamp");
  if (!Number.isFinite(sessionClose)) {
    throw new Error("sessionClose must be a valid timestamp");
  }

  return now >= sessionClose;
}

