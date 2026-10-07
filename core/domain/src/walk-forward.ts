import type { Bar } from "./market-data.js";
import type { StrategyDefinition } from "./strategy.js";
import { runBacktest, type BacktestResult } from "./backtest.js";

export interface WalkForwardWindow {
  readonly trainFrom: number; readonly trainTo: number;
  readonly testFrom: number; readonly testTo: number;
}

export interface WalkForwardResult {
  readonly windows: readonly WalkForwardWindow[];
  readonly tests: readonly BacktestResult[];
}

export function createWalkForwardWindows(
  length: number,
  trainSize: number,
  testSize: number,
  step?: number,
): readonly WalkForwardWindow[] {
  if (!Number.isInteger(length) || length <= 0) throw new Error("length must be positive");
  if (!Number.isInteger(trainSize) || trainSize <= 0) throw new Error("trainSize must be positive");
  if (!Number.isInteger(testSize) || testSize <= 0) throw new Error("testSize must be positive");
  const stride = step ?? testSize;
  if (!Number.isInteger(stride) || stride <= 0) throw new Error("step must be positive");
  const windows: WalkForwardWindow[] = [];
  for (let trainFrom = 0; trainFrom + trainSize + testSize <= length; trainFrom += stride) {
    windows.push(Object.freeze({
      trainFrom, trainTo: trainFrom + trainSize,
      testFrom: trainFrom + trainSize, testTo: trainFrom + trainSize + testSize,
    }));
  }
  return Object.freeze(windows);
}

export function runWalkForward(input: {
  readonly bars: readonly Bar[];
  readonly strategy: StrategyDefinition;
  readonly trainSize: number;
  readonly testSize: number;
  readonly step?: number;
  readonly initialCapital: number;
}): WalkForwardResult {
  const windows = createWalkForwardWindows(input.bars.length, input.trainSize, input.testSize, input.step);
  const tests = windows.map((w) => runBacktest({
    strategy: input.strategy,
    bars: input.bars.slice(w.testFrom, w.testTo),
    initialCapital: input.initialCapital,
  }));
  return Object.freeze({ windows, tests: Object.freeze(tests) });
}
