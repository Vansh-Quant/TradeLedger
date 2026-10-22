import type { OrderType } from "@/api/types";

/**
 * `submitOrderFromIntent` derives order notional from an authoritative limit
 * price and rejects anything without one. Market and stop orders therefore
 * cannot be admitted until a pricing source exists; the UI must not allow a
 * submission the backend will always reject.
 */
export function orderTypeRequiresPricing(type: OrderType): boolean {
  return type === "MARKET" || type === "STOP";
}
