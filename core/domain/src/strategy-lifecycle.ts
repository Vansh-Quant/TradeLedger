import type { PerformanceMetrics } from "./performance.js";

export const STRATEGY_LIFECYCLE_STATES = [
  "draft", "research", "validated", "paper", "live", "retired",
] as const;
export type StrategyLifecycleState = (typeof STRATEGY_LIFECYCLE_STATES)[number];

const TRANSITIONS: Readonly<Record<StrategyLifecycleState, readonly StrategyLifecycleState[]>> = {
  draft: ["research", "retired"],
  research: ["validated", "draft", "retired"],
  validated: ["paper", "research", "retired"],
  paper: ["live", "validated", "retired"],
  live: ["paper", "retired"],
  retired: [],
};

export interface StrategyLifecycle {
  readonly strategyId: string;
  readonly version: number;
  readonly state: StrategyLifecycleState;
  readonly lastPerformance?: PerformanceMetrics;
}

export function createStrategyLifecycle(strategyId: string, version: number): StrategyLifecycle {
  if (!strategyId.trim()) throw new Error("strategyId must not be empty");
  if (!Number.isInteger(version) || version <= 0) throw new Error("version must be a positive integer");
  return Object.freeze({ strategyId: strategyId.trim(), version, state: "draft" as const });
}

export function transitionStrategyLifecycle(
  lifecycle: StrategyLifecycle,
  next: StrategyLifecycleState,
  performance?: PerformanceMetrics,
): StrategyLifecycle {
  if (!TRANSITIONS[lifecycle.state].includes(next)) {
    throw new Error("cannot transition strategy from " + lifecycle.state + " to " + next);
  }
  if (next === "live" && performance === undefined) {
    throw new Error("live promotion requires performance evidence");
  }
  return Object.freeze({
    ...lifecycle,
    state: next,
    ...(performance === undefined ? {} : { lastPerformance: performance }),
  });
}
