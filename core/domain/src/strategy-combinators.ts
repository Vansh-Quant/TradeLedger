import type { StrategyContext, StrategySignal } from "./strategy.js";

export type SignalRule = (context: StrategyContext) => StrategySignal;

export function combineSignals(
  rules: readonly SignalRule[],
  mode: "all" | "any" = "all",
): SignalRule {
  if (rules.length === 0) throw new Error("rules must not be empty");
  return (context) => {
    const signals = rules.map((rule) => rule(context));
    if (mode === "all") {
      if (signals.every((signal) => signal === "long")) return "long";
      if (signals.every((signal) => signal === "short")) return "short";
      return "flat";
    }
    if (signals.some((signal) => signal === "long")) return "long";
    if (signals.some((signal) => signal === "short")) return "short";
    return "flat";
  };
}

export function thresholdSignal(
  score: (context: StrategyContext) => number,
  longThreshold: number,
  shortThreshold: number,
): SignalRule {
  if (!Number.isFinite(longThreshold) || !Number.isFinite(shortThreshold)) {
    throw new Error("thresholds must be finite");
  }
  if (shortThreshold >= longThreshold) throw new Error("shortThreshold must be below longThreshold");
  return (context) => {
    const value = score(context);
    if (!Number.isFinite(value)) throw new Error("signal score must be finite");
    if (value >= longThreshold) return "long";
    if (value <= shortThreshold) return "short";
    return "flat";
  };
}
