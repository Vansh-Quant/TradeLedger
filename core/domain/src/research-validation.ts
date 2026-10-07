import type { PerformanceMetrics } from "./performance.js";

export interface ValidationGate {
  readonly minTradeCount?: number;
  readonly minReturnPct?: number;
  readonly maxDrawdownPct?: number;
  readonly minProfitFactor?: number;
  readonly minWinRatePct?: number;
  readonly minSharpeLike?: number;
}

export interface ValidationResult {
  readonly passed: boolean;
  readonly failures: readonly string[];
}

export function validatePerformance(
  metrics: PerformanceMetrics,
  gate: ValidationGate,
): ValidationResult {
  const failures: string[] = [];
  if (gate.minTradeCount !== undefined && metrics.tradeCount < gate.minTradeCount) failures.push("trade count below minimum");
  if (gate.minReturnPct !== undefined && metrics.returnPct < gate.minReturnPct) failures.push("return below minimum");
  if (gate.maxDrawdownPct !== undefined && metrics.maxDrawdownPct > gate.maxDrawdownPct) failures.push("drawdown above maximum");
  if (gate.minProfitFactor !== undefined && metrics.profitFactor < gate.minProfitFactor) failures.push("profit factor below minimum");
  if (gate.minWinRatePct !== undefined && metrics.winRatePct < gate.minWinRatePct) failures.push("win rate below minimum");
  if (gate.minSharpeLike !== undefined && metrics.sharpeLike < gate.minSharpeLike) failures.push("risk-adjusted score below minimum");
  return Object.freeze({ passed: failures.length === 0, failures: Object.freeze(failures) });
}
