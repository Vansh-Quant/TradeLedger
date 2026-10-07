import type { PerformanceMetrics } from "./performance.js";
import { validatePerformance, type ValidationGate } from "./research-validation.js";

export interface OosValidation {
  readonly inSample: PerformanceMetrics;
  readonly validation: PerformanceMetrics;
  readonly outOfSample: PerformanceMetrics;
  readonly passed: boolean;
  readonly failures: readonly string[];
}

export function validateOutOfSample(
  input: {
    readonly inSample: PerformanceMetrics;
    readonly validation: PerformanceMetrics;
    readonly outOfSample: PerformanceMetrics;
    readonly gate: ValidationGate;
  },
): OosValidation {
  const failures: string[] = [];
  for (const [name, metrics] of [
    ["in-sample", input.inSample],
    ["validation", input.validation],
    ["out-of-sample", input.outOfSample],
  ] as const) {
    const result = validatePerformance(metrics, input.gate);
    if (!result.passed) failures.push(...result.failures.map((failure) => name + ": " + failure));
  }
  if (input.outOfSample.returnPct < 0) failures.push("out-of-sample: negative return");
  return Object.freeze({
    inSample: input.inSample,
    validation: input.validation,
    outOfSample: input.outOfSample,
    passed: failures.length === 0,
    failures: Object.freeze(failures),
  });
}
