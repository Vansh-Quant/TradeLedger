import type { Bar } from "./market-data.js";
import type { StrategyDefinition, StrategySignal } from "./strategy.js";

export interface StrategyDecision {
  readonly strategyId: string;
  readonly timestamp: string;
  readonly signal: StrategySignal;
  readonly confidence: number;
}

export function evaluateStrategy(
  strategy: StrategyDefinition,
  bars: readonly Bar[],
): StrategyDecision {
  if (bars.length === 0) throw new Error("bars must not be empty");
  const last = bars[bars.length - 1]!;
  const closes = bars.map((bar) => bar.close);
  const signal = strategy.evaluate({
    index: bars.length - 1,
    timestamp: last.endAt,
    closes,
  });
  return Object.freeze({
    strategyId: strategy.id,
    timestamp: last.endAt,
    signal,
    confidence: signal === "flat" ? 0 : 1,
  });
}

export function evaluateStrategySeries(
  strategy: StrategyDefinition,
  bars: readonly Bar[],
): readonly StrategyDecision[] {
  return Object.freeze(bars.map((_, index) => evaluateStrategy(strategy, bars.slice(0, index + 1))));
}
