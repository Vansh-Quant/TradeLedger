export const STRATEGY_SIGNALS = ["flat","long","short"] as const;
export type StrategySignal = (typeof STRATEGY_SIGNALS)[number];

export interface StrategyContext {
  readonly index: number;
  readonly timestamp: string;
  readonly closes: readonly number[];
}

export interface StrategyDefinition {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly parameters: Readonly<Record<string, number>>;
  readonly evaluate: (context: StrategyContext) => StrategySignal;
}

export function createStrategyDefinition(input: {
  readonly id: string; readonly name: string; readonly version?: number;
  readonly parameters?: Readonly<Record<string, number>>;
  readonly evaluate: (context: StrategyContext) => StrategySignal;
}): StrategyDefinition {
  if (!input.id.trim() || !input.name.trim()) throw new Error("strategy id and name must not be empty");
  if (!Number.isInteger(input.version ?? 1) || (input.version ?? 1) <= 0) throw new Error("strategy version must be a positive integer");
  for (const [key, value] of Object.entries(input.parameters ?? {})) {
    if (!key.trim() || !Number.isFinite(value)) throw new Error("strategy parameters must be finite");
  }
  return Object.freeze({
    id: input.id.trim(), name: input.name.trim(), version: input.version ?? 1,
    parameters: Object.freeze({ ...(input.parameters ?? {}) }), evaluate: input.evaluate,
  });
}
