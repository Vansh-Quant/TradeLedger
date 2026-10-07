import type { StrategyDefinition, StrategySignal } from "./strategy.js";
import type { Bar } from "./market-data.js";
import { runBacktest } from "./backtest.js";
import { calculatePerformance, type PerformanceMetrics } from "./performance.js";

export interface OptimizationResult {
  readonly parameters: Readonly<Record<string, number>>;
  readonly performance: PerformanceMetrics;
}

export function optimizeStrategy(input: {
  readonly strategy: StrategyDefinition;
  readonly bars: readonly Bar[];
  readonly parameterSets: readonly Readonly<Record<string, number>>[];
  readonly initialCapital: number;
}): OptimizationResult | undefined {
  let best: OptimizationResult | undefined;
  for (const parameters of input.parameterSets) {
    const strategy: StrategyDefinition = Object.freeze({
      ...input.strategy,
      parameters: Object.freeze({ ...input.strategy.parameters, ...parameters }),
    });
    const result = calculatePerformance(runBacktest({
      strategy,
      bars: input.bars,
      initialCapital: input.initialCapital,
    }));
    if (best === undefined || result.returnPct > best.performance.returnPct) {
      best = Object.freeze({ parameters: Object.freeze({ ...strategy.parameters }), performance: result });
    }
  }
  return best;
}
