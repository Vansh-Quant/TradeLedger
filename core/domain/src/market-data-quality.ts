import { midPrice, spread, type Quote } from "./market-data.js";

export interface MarketDataQualityPolicy {
  /** Maximum acceptable age of a quote, measured in milliseconds. */
  readonly maxAgeMs: number;
  /** Maximum acceptable bid/ask spread as basis points of the mid price. */
  readonly maxSpreadBps: number;
  /** Small allowance for provider clock skew into the future. */
  readonly maxFutureSkewMs: number;
}

export type MarketDataQualityStatus =
  | "missing"
  | "healthy"
  | "stale"
  | "future-dated"
  | "wide-spread";

export interface MarketDataQualityAssessment {
  readonly status: MarketDataQualityStatus;
  readonly usable: boolean;
  readonly ageMs: number | null;
  readonly spreadBps: number | null;
  readonly reasons: readonly string[];
}

function timestamp(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(field + " must be a valid timestamp");
  }
  return parsed;
}

function validatePolicy(policy: MarketDataQualityPolicy): void {
  if (!Number.isInteger(policy.maxAgeMs) || policy.maxAgeMs < 0) {
    throw new Error("maxAgeMs must be a non-negative integer");
  }
  if (!Number.isFinite(policy.maxSpreadBps) || policy.maxSpreadBps <= 0) {
    throw new Error("maxSpreadBps must be a finite positive number");
  }
  if (!Number.isInteger(policy.maxFutureSkewMs) || policy.maxFutureSkewMs < 0) {
    throw new Error("maxFutureSkewMs must be a non-negative integer");
  }
}

/**
 * Deterministically evaluates whether a quote is safe to consume at a given
 * time. It never substitutes a stale quote, guesses a price, or reads the
 * system clock implicitly; callers provide both time and policy.
 */
export function assessMarketDataQuality(
  quote: Quote | null | undefined,
  now: string,
  policy: MarketDataQualityPolicy,
): MarketDataQualityAssessment {
  validatePolicy(policy);
  const current = timestamp(now, "now");

  if (quote == null) {
    return Object.freeze({
      status: "missing",
      usable: false,
      ageMs: null,
      spreadBps: null,
      reasons: Object.freeze(["quote is missing"]),
    });
  }

  const observed = timestamp(quote.observedAt, "quote.observedAt");
  const ageMs = current - observed;
  const mid = midPrice(quote);
  const spreadBps = (spread(quote) / mid) * 10_000;
  const reasons: string[] = [];

  if (ageMs < -policy.maxFutureSkewMs) {
    reasons.push("quote observation is too far in the future");
  } else if (ageMs > policy.maxAgeMs) {
    reasons.push("quote is stale");
  }

  if (spreadBps > policy.maxSpreadBps) {
    reasons.push("quote spread exceeds configured limit");
  }

  const status: MarketDataQualityStatus =
    reasons.some((reason) => reason === "quote observation is too far in the future")
      ? "future-dated"
      : reasons.some((reason) => reason === "quote is stale")
        ? "stale"
        : reasons.some((reason) => reason === "quote spread exceeds configured limit")
          ? "wide-spread"
          : "healthy";

  return Object.freeze({
    status,
    usable: reasons.length === 0,
    ageMs,
    spreadBps,
    reasons: Object.freeze(reasons),
  });
}
