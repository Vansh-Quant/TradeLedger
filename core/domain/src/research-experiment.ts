import type { Bar } from "./market-data.js";
import type { StrategyDefinition } from "./strategy.js";
import { runBacktest } from "./backtest.js";
import { calculatePerformance, type PerformanceMetrics } from "./performance.js";

export interface ResearchExperiment {
  readonly id: string;
  readonly strategyId: string;
  readonly createdAt: string;
  readonly result: PerformanceMetrics;
}

export function runResearchExperiment(input: {
  readonly id: string; readonly strategy: StrategyDefinition; readonly bars: readonly Bar[];
  readonly initialCapital: number; readonly createdAt: string;
}): ResearchExperiment {
  if (!input.id.trim()) throw new Error("id must not be empty");
  if (!Number.isFinite(Date.parse(input.createdAt))) throw new Error("createdAt must be a valid timestamp");
  const result = calculatePerformance(runBacktest({
    strategy: input.strategy, bars: input.bars, initialCapital: input.initialCapital,
  }));
  return Object.freeze({
    id: input.id.trim(), strategyId: input.strategy.id, createdAt: input.createdAt, result,
  });
}
