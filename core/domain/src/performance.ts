import type { BacktestResult } from "./backtest.js";

export interface PerformanceMetrics {
  readonly netPnl: number; readonly returnPct: number; readonly maxDrawdownPct: number;
  readonly winRatePct: number; readonly profitFactor: number; readonly tradeCount: number;
  readonly sharpeLike: number;
}

export function calculatePerformance(result: BacktestResult): PerformanceMetrics {
  const netPnl = result.finalCapital - result.initialCapital;
  const returnPct = netPnl / result.initialCapital;
  let peak = result.equityCurve[0] ?? result.initialCapital;
  let maxDrawdown = 0;
  for (const equity of result.equityCurve) {
    peak = Math.max(peak, equity);
    if (peak > 0) maxDrawdown = Math.max(maxDrawdown, (peak - equity) / peak);
  }
  const wins = result.trades.filter((trade) => trade.pnl > 0);
  const losses = result.trades.filter((trade) => trade.pnl < 0);
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const tradeReturns = result.trades.map((t) => t.pnl / result.initialCapital);
  const mean = tradeReturns.length === 0 ? 0 : tradeReturns.reduce((s, x) => s + x, 0) / tradeReturns.length;
  const variance = tradeReturns.length < 2 ? 0 : tradeReturns.reduce((s, x) => s + (x - mean) ** 2, 0) / (tradeReturns.length - 1);
  return Object.freeze({
    netPnl, returnPct, maxDrawdownPct: maxDrawdown,
    winRatePct: result.trades.length === 0 ? 0 : wins.length / result.trades.length,
    profitFactor: grossLoss === 0 ? (grossProfit > 0 ? Number.POSITIVE_INFINITY : 0) : grossProfit / grossLoss,
    tradeCount: result.trades.length,
    sharpeLike: variance === 0 ? 0 : mean / Math.sqrt(variance),
  });
}
