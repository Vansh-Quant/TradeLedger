import type { BacktestResult } from "./backtest.js";
import { calculatePerformance, type PerformanceMetrics } from "./performance.js";
import { validatePerformance, type ValidationGate, type ValidationResult } from "./research-validation.js";

export interface ResearchReport {
  readonly strategyId: string;
  readonly performance: PerformanceMetrics;
  readonly validation: ValidationResult;
  readonly robustness: {
    readonly tradeCount: number;
    readonly positiveTradePct: number;
    readonly worstTrade: number;
    readonly bestTrade: number;
  };
}

export function createResearchReport(
  result: BacktestResult,
  gate: ValidationGate = {},
): ResearchReport {
  const performance = calculatePerformance(result);
  const pnl = result.trades.map((trade) => trade.pnl);
  const positive = pnl.filter((value) => value > 0).length;
  const validation = validatePerformance(performance, gate);
  return Object.freeze({
    strategyId: result.strategyId,
    performance,
    validation,
    robustness: Object.freeze({
      tradeCount: result.trades.length,
      positiveTradePct: result.trades.length === 0 ? 0 : positive / result.trades.length,
      worstTrade: pnl.length === 0 ? 0 : Math.min(...pnl),
      bestTrade: pnl.length === 0 ? 0 : Math.max(...pnl),
    }),
  });
}
