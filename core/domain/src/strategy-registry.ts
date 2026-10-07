import type { StrategyDefinition } from "./strategy.js";

export interface StrategyRegistry {
  readonly strategies: readonly StrategyDefinition[];
}

export function createStrategyRegistry(): StrategyRegistry {
  return Object.freeze({ strategies: Object.freeze([]) });
}

export function registerStrategy(registry: StrategyRegistry, strategy: StrategyDefinition): StrategyRegistry {
  if (registry.strategies.some((x) => x.id === strategy.id && x.version === strategy.version)) {
    throw new Error("strategy version already registered");
  }
  return Object.freeze({ strategies: Object.freeze([...registry.strategies, strategy]) });
}

export function getStrategy(registry: StrategyRegistry, id: string, version?: number): StrategyDefinition | undefined {
  const matches = registry.strategies.filter((x) => x.id === id);
  if (version !== undefined) return matches.find((x) => x.version === version);
  return matches.reduce<StrategyDefinition | undefined>((latest, item) =>
    latest === undefined || item.version > latest.version ? item : latest, undefined);
}
