import type { InstrumentId } from "./instrument.js";

export const ALERT_OPERATORS = ["gt", "gte", "lt", "lte", "eq", "crosses_above", "crosses_below"] as const;
export type AlertOperator = (typeof ALERT_OPERATORS)[number];

export interface PriceAlert {
  readonly id: string;
  readonly instrumentId: InstrumentId;
  readonly operator: AlertOperator;
  readonly threshold: number;
  readonly enabled: boolean;
  readonly triggeredAt?: string;
}

function positive(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(field + " must be a positive finite number");
  return value;
}
function nonEmpty(value: string, field: string): string {
  const v = value.trim();
  if (!v) throw new Error(field + " must not be empty");
  return v;
}

export function createPriceAlert(input: {
  readonly id: string; readonly instrumentId: InstrumentId; readonly operator: AlertOperator;
  readonly threshold: number; readonly enabled?: boolean;
}): PriceAlert {
  if (!ALERT_OPERATORS.includes(input.operator)) throw new Error("operator is invalid");
  return Object.freeze({
    id: nonEmpty(input.id, "id"),
    instrumentId: nonEmpty(input.instrumentId, "instrumentId") as InstrumentId,
    operator: input.operator,
    threshold: positive(input.threshold, "threshold"),
    enabled: input.enabled ?? true,
  });
}

function crossed(operator: AlertOperator, previous: number | undefined, current: number, threshold: number): boolean {
  if (operator === "crosses_above") return previous !== undefined && previous <= threshold && current > threshold;
  if (operator === "crosses_below") return previous !== undefined && previous >= threshold && current < threshold;
  if (operator === "gt") return current > threshold;
  if (operator === "gte") return current >= threshold;
  if (operator === "lt") return current < threshold;
  return current === threshold;
}

export function evaluatePriceAlert(
  alert: PriceAlert,
  currentPrice: number,
  previousPrice?: number,
  triggeredAt?: string,
): PriceAlert {
  positive(currentPrice, "currentPrice");
  if (previousPrice !== undefined) positive(previousPrice, "previousPrice");
  if (!alert.enabled || alert.triggeredAt !== undefined || !crossed(alert.operator, previousPrice, currentPrice, alert.threshold)) {
    return alert;
  }
  const at = triggeredAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(at))) throw new Error("triggeredAt must be a valid timestamp");
  return Object.freeze({ ...alert, enabled: false, triggeredAt: at });
}
