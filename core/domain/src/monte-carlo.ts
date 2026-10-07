import type { BacktestResult } from "./backtest.js";

export interface MonteCarloSummary {
  readonly simulations: number;
  readonly medianReturnPct: number;
  readonly worstReturnPct: number;
  readonly bestReturnPct: number;
  readonly probabilityOfLoss: number;
  readonly returns: readonly number[];
}

function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const index = (values.length - 1) * p;
  const low = Math.floor(index), high = Math.ceil(index);
  if (low === high) return values[low]!;
  return values[low]! + (values[high]! - values[low]!) * (index - low);
}

export function runTradeMonteCarlo(
  result: BacktestResult,
  simulations: number,
  random: () => number = Math.random,
): MonteCarloSummary {
  if (!Number.isInteger(simulations) || simulations <= 0) throw new Error("simulations must be a positive integer");
  const pnl = result.trades.map((trade) => trade.pnl);
  if (pnl.length === 0) throw new Error("backtest must contain trades");
  const returns: number[] = [];
  for (let simulation = 0; simulation < simulations; simulation++) {
    let capital = result.initialCapital;
    for (let i = 0; i < pnl.length; i++) {
      const index = Math.min(pnl.length - 1, Math.floor(random() * pnl.length));
      capital += pnl[index]!;
    }
    returns.push((capital - result.initialCapital) / result.initialCapital);
  }
  returns.sort((a, b) => a - b);
  return Object.freeze({
    simulations,
    medianReturnPct: percentile(returns, 0.5),
    worstReturnPct: returns[0]!,
    bestReturnPct: returns[returns.length - 1]!,
    probabilityOfLoss: returns.filter((value) => value < 0).length / returns.length,
    returns: Object.freeze(returns),
  });
}
