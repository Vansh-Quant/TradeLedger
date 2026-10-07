import type { PerformanceMetrics } from "./performance.js";
import { validatePerformance, type ValidationGate } from "./research-validation.js";
import { transitionStrategyLifecycle, type StrategyLifecycle } from "./strategy-lifecycle.js";

export interface PromotionEvidence {
  readonly inSample: PerformanceMetrics;
  readonly outOfSample: PerformanceMetrics;
  readonly gate: ValidationGate;
}

export function promoteStrategy(
  lifecycle: StrategyLifecycle,
  evidence: PromotionEvidence,
): StrategyLifecycle {
  const inSample = validatePerformance(evidence.inSample, evidence.gate);
  const outOfSample = validatePerformance(evidence.outOfSample, evidence.gate);
  if (!inSample.passed || !outOfSample.passed) {
    throw new Error("strategy promotion gate failed");
  }
  if (lifecycle.state === "draft") {
    return transitionStrategyLifecycle(lifecycle, "research", evidence.inSample);
  }
  if (lifecycle.state === "research") {
    return transitionStrategyLifecycle(lifecycle, "validated", evidence.outOfSample);
  }
  if (lifecycle.state === "validated") {
    return transitionStrategyLifecycle(lifecycle, "paper", evidence.outOfSample);
  }
  if (lifecycle.state === "paper") {
    return transitionStrategyLifecycle(lifecycle, "live", evidence.outOfSample);
  }
  throw new Error("strategy cannot be promoted from " + lifecycle.state);
}
