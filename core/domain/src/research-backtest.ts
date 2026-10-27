import { runBacktest, type BacktestTrade } from "./backtest.js";
import { simpleMovingAverage } from "./indicators.js";
import type { Bar } from "./market-data.js";
import { createResearchReport, type ResearchReport } from "./research-report.js";
import { createStrategyDefinition, type StrategyDefinition, type StrategySignal } from "./strategy.js";

/**
 * Bounded strategy interface for research runs.
 *
 * Strategies are *declarative specifications* compiled server-side into
 * deterministic `StrategyDefinition` functions. User input is validated
 * numerically (kinds, ranges, cross-field constraints) and never executed as
 * code, so a submitted strategy cannot run arbitrary logic inside the API
 * process. Extending the interface means adding a new kind here — not loading
 * a submitted program.
 */
export const STRATEGY_SPEC_KINDS = [
  "sma_crossover",
  "rsi_reversion",
  "donchian_breakout",
  "buy_and_hold",
] as const;
export type StrategySpecKind = (typeof STRATEGY_SPEC_KINDS)[number];

export interface StrategyParameterSpec {
  readonly key: string;
  readonly label: string;
  readonly help: string;
  readonly default: number;
  readonly min: number;
  readonly max: number;
  readonly integer: boolean;
}

export interface StrategySpecDefinition {
  readonly kind: StrategySpecKind;
  readonly name: string;
  readonly description: string;
  readonly parameters: readonly StrategyParameterSpec[];
}

const SMA_FAST: StrategyParameterSpec = { key: "fast", label: "Fast MA", help: "Fast simple-moving-average window in bars.", default: 10, min: 2, max: 500, integer: true };
const SMA_SLOW: StrategyParameterSpec = { key: "slow", label: "Slow MA", help: "Slow simple-moving-average window in bars; must be larger than the fast window.", default: 30, min: 3, max: 1000, integer: true };
const RSI_PERIOD: StrategyParameterSpec = { key: "period", label: "RSI period", help: "Wilder RSI lookback in bars.", default: 14, min: 2, max: 200, integer: true };
const RSI_OVERSOLD: StrategyParameterSpec = { key: "oversold", label: "Oversold", help: "RSI at or below this level opens a long.", default: 30, min: 1, max: 49, integer: true };
const RSI_OVERBOUGHT: StrategyParameterSpec = { key: "overbought", label: "Overbought", help: "RSI at or above this level opens a short.", default: 70, min: 51, max: 99, integer: true };
const DONCHIAN_LOOKBACK: StrategyParameterSpec = { key: "lookback", label: "Lookback", help: "Bars in the close-price breakout window.", default: 20, min: 2, max: 500, integer: true };

export const STRATEGY_SPECS: readonly StrategySpecDefinition[] = Object.freeze([
  Object.freeze({
    kind: "sma_crossover" as const,
    name: "SMA trend filter",
    description: "Long while the fast moving average is above the slow moving average, flat otherwise.",
    parameters: Object.freeze([SMA_FAST, SMA_SLOW]),
  }),
  Object.freeze({
    kind: "rsi_reversion" as const,
    name: "RSI mean reversion",
    description: "Long when RSI is at or below the oversold level, short at or above the overbought level, flat in between.",
    parameters: Object.freeze([RSI_PERIOD, RSI_OVERSOLD, RSI_OVERBOUGHT]),
  }),
  Object.freeze({
    kind: "donchian_breakout" as const,
    name: "Close-price breakout",
    description: "Long when the close is the highest close of the window, short when it is the lowest, flat otherwise.",
    parameters: Object.freeze([DONCHIAN_LOOKBACK]),
  }),
  Object.freeze({
    kind: "buy_and_hold" as const,
    name: "Buy and hold",
    description: "Stays long on every bar. Useful as a baseline comparison.",
    parameters: Object.freeze([]),
  }),
]);

export interface StrategySpec {
  readonly kind: StrategySpecKind;
  readonly parameters: Readonly<Record<string, number>>;
}

function specDefinition(kind: string): StrategySpecDefinition | undefined {
  return STRATEGY_SPECS.find((item) => item.kind === kind);
}

/**
 * Validates a submitted strategy specification against the built-in catalog.
 * Throws with a human-readable reason; the API maps it to a 400 response.
 */
export function validateStrategySpec(input: unknown): StrategySpec {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("strategy must be an object with a kind and parameters");
  }
  const raw = input as Record<string, unknown>;
  if (typeof raw.kind !== "string") throw new Error("strategy.kind must be a string");
  const definition = specDefinition(raw.kind);
  if (definition === undefined) {
    throw new Error(`strategy kind "${raw.kind}" is not supported; valid kinds: ${STRATEGY_SPEC_KINDS.join(", ")}`);
  }
  const rawParameters = raw.parameters ?? {};
  if (typeof rawParameters !== "object" || rawParameters === null || Array.isArray(rawParameters)) {
    throw new Error("strategy.parameters must be an object");
  }

  const parameters: Record<string, number> = {};
  for (const [key, value] of Object.entries(rawParameters as Record<string, unknown>)) {
    const spec = definition.parameters.find((item) => item.key === key);
    if (spec === undefined) {
      throw new Error(`strategy parameter "${key}" is not valid for ${definition.kind}; valid parameters: ${definition.parameters.map((p) => p.key).join(", ") || "none"}`);
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`strategy parameter "${key}" must be a finite number`);
    }
    if (spec.integer && !Number.isInteger(value)) {
      throw new Error(`strategy parameter "${key}" must be an integer`);
    }
    if (value < spec.min || value > spec.max) {
      throw new Error(`strategy parameter "${key}" must be between ${spec.min} and ${spec.max}`);
    }
    parameters[key] = value;
  }
  // Missing parameters fall back to their documented defaults.
  for (const spec of definition.parameters) {
    if (parameters[spec.key] === undefined) parameters[spec.key] = spec.default;
  }

  if (definition.kind === "sma_crossover" && parameters.fast! >= parameters.slow!) {
    throw new Error("sma_crossover requires the fast window to be smaller than the slow window");
  }
  if (definition.kind === "rsi_reversion" && parameters.oversold! >= parameters.overbought!) {
    throw new Error("rsi_reversion requires oversold to be below overbought");
  }

  return Object.freeze({ kind: definition.kind, parameters: Object.freeze(parameters) });
}

/** Wilder RSI over the closes visible at the current index. Deterministic. */
function wilderRsi(closes: readonly number[], period: number): number | undefined {
  if (closes.length <= period) return undefined;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i += 1) {
    const change = closes[i]! - closes[i - 1]!;
    if (change >= 0) gain += change;
    else loss -= change;
  }
  let averageGain = gain / period;
  let averageLoss = loss / period;
  for (let i = period + 1; i < closes.length; i += 1) {
    const change = closes[i]! - closes[i - 1]!;
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
  }
  if (averageLoss === 0) return averageGain === 0 ? 50 : 100;
  const relativeStrength = averageGain / averageLoss;
  return 100 - 100 / (1 + relativeStrength);
}

/** Compiles a validated specification into a deterministic strategy function. */
export function compileStrategy(spec: StrategySpec): StrategyDefinition {
  const definition = specDefinition(spec.kind);
  if (definition === undefined) throw new Error(`strategy kind "${spec.kind}" is not supported`);

  const evaluate = (context: { closes: readonly number[] }): StrategySignal => {
    const closes = context.closes;
    switch (spec.kind) {
      case "buy_and_hold":
        return "long";
      case "sma_crossover": {
        const fast = simpleMovingAverage(closes, spec.parameters.fast!);
        const slow = simpleMovingAverage(closes, spec.parameters.slow!);
        if (fast === undefined || slow === undefined) return "flat";
        return fast > slow ? "long" : "flat";
      }
      case "rsi_reversion": {
        const rsi = wilderRsi(closes, spec.parameters.period!);
        if (rsi === undefined) return "flat";
        if (rsi <= spec.parameters.oversold!) return "long";
        if (rsi >= spec.parameters.overbought!) return "short";
        return "flat";
      }
      case "donchian_breakout": {
        const lookback = spec.parameters.lookback!;
        if (closes.length < lookback) return "flat";
        const window = closes.slice(-lookback);
        const close = closes[closes.length - 1]!;
        const highest = Math.max(...window);
        const lowest = Math.min(...window);
        if (close === highest) return "long";
        if (close === lowest) return "short";
        return "flat";
      }
    }
  };

  return createStrategyDefinition({
    id: `spec:${spec.kind}`,
    name: definition.name,
    version: 1,
    parameters: spec.parameters,
    evaluate: (context) => evaluate({ closes: context.closes }),
  });
}

/** Smallest bar count in which the strategy can produce a non-flat signal. */
export function minimumBarsForSpec(spec: StrategySpec): number {
  switch (spec.kind) {
    case "sma_crossover": return spec.parameters.slow! + 2;
    case "rsi_reversion": return spec.parameters.period! + 2;
    case "donchian_breakout": return spec.parameters.lookback! + 1;
    case "buy_and_hold": return 2;
  }
}

export interface ResearchBacktestInput {
  readonly runId: string;
  readonly createdAt: string;
  readonly accountId: string;
  readonly instrumentId: string;
  readonly interval: string;
  readonly requestedFrom: string;
  readonly requestedTo: string;
  readonly spec: StrategySpec;
  readonly bars: readonly Bar[];
  readonly initialCapital: number;
  readonly quantity: number;
  readonly commissionPerTrade: number;
  readonly slippageBps: number;
}

export interface ResearchBacktestRun {
  readonly runId: string;
  readonly createdAt: string;
  readonly accountId: string;
  readonly instrumentId: string;
  readonly interval: string;
  readonly requested: { readonly from: string; readonly to: string };
  readonly dataRange: {
    readonly from: string;
    readonly to: string;
    readonly count: number;
    readonly source?: string;
  };
  readonly strategy: { readonly kind: StrategySpecKind; readonly name: string; readonly version: number; readonly parameters: Readonly<Record<string, number>> };
  readonly assumptions: {
    readonly initialCapital: number;
    readonly quantity: number;
    readonly commissionPerTrade: number;
    readonly slippageBps: number;
    readonly execution: "next-bar-open";
  };
  readonly report: ResearchReport;
  readonly equityCurve: readonly { readonly at: string; readonly equity: number }[];
  readonly trades: readonly BacktestTrade[];
  readonly warnings: readonly string[];
}

/**
 * Runs a deterministic backtest over caller-supplied bars. Signals computed on
 * bar N execute at bar N+1 open (enforced by `runBacktest`), so no strategy
 * can trade on the same close it evaluated, and identical inputs always
 * produce identical outputs.
 */
export function runResearchBacktest(input: ResearchBacktestInput): ResearchBacktestRun {
  if (input.bars.length === 0) throw new Error("backtest requires at least one historical bar");
  if (input.bars.length < 2) throw new Error("backtest requires at least two historical bars");

  const strategy = compileStrategy(input.spec);
  const result = runBacktest({
    strategy,
    bars: input.bars,
    initialCapital: input.initialCapital,
    quantity: input.quantity,
    commissionPerTrade: input.commissionPerTrade,
    slippageBps: input.slippageBps,
  });
  const report = createResearchReport(result);

  const first = input.bars[0]!;
  const last = input.bars[input.bars.length - 1]!;
  const equityCurve = result.equityCurve.map((equity, index) => ({
    at: index === 0 ? first.startAt : input.bars[index - 1]!.endAt,
    equity,
  }));

  const warnings: string[] = [];
  const minimum = minimumBarsForSpec(input.spec);
  if (input.bars.length < minimum) {
    warnings.push(`only ${input.bars.length} bars available; ${strategy.name} needs at least ${minimum} bars before it can signal`);
  }
  if (result.trades.length === 0) {
    warnings.push("the strategy produced no trades in this range");
  }
  const requestedFrom = Date.parse(input.requestedFrom);
  const requestedTo = Date.parse(input.requestedTo);
  if (Number.isFinite(requestedFrom) && Date.parse(first.startAt) > requestedFrom + 60_000) {
    warnings.push(`provider history starts at ${first.startAt}, later than the requested start ${input.requestedFrom}`);
  }
  if (Number.isFinite(requestedTo) && Date.parse(last.endAt) < requestedTo - 60_000) {
    warnings.push(`provider history ends at ${last.endAt}, earlier than the requested end ${input.requestedTo}`);
  }

  return Object.freeze({
    runId: input.runId,
    createdAt: input.createdAt,
    accountId: input.accountId,
    instrumentId: input.instrumentId,
    interval: input.interval,
    requested: Object.freeze({ from: input.requestedFrom, to: input.requestedTo }),
    dataRange: Object.freeze({
      from: first.startAt,
      to: last.endAt,
      count: input.bars.length,
      ...(first.source === undefined ? {} : { source: first.source }),
    }),
    strategy: Object.freeze({
      kind: input.spec.kind,
      name: strategy.name,
      version: strategy.version,
      parameters: input.spec.parameters,
    }),
    assumptions: Object.freeze({
      initialCapital: input.initialCapital,
      quantity: input.quantity,
      commissionPerTrade: input.commissionPerTrade,
      slippageBps: input.slippageBps,
      execution: "next-bar-open" as const,
    }),
    report,
    equityCurve: Object.freeze(equityCurve),
    trades: result.trades,
    warnings: Object.freeze(warnings),
  });
}