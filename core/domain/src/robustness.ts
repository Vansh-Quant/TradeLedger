import type { BacktestResult } from "./backtest.js";

export interface RobustnessSummary {
  readonly baselineReturnPct: number;
  readonly worstReturnPct: number;
  readonly bestReturnPct: number;
  readonly averageReturnPct: number;
  readonly scenarios: readonly { readonly name: string; readonly returnPct: number; readonly maxDrawdownPct: number }[];
}

export function summarizeRobustness(
  results: readonly { readonly name: string; readonly result: BacktestResult }[],
): RobustnessSummary {
  if (results.length === 0) throw new Error("results must not be empty");
  const scenarios = results.map(({name,result}) => {
    const initial = result.initialCapital;
    const returnPct = (result.finalCapital - initial) / initial;
    let peak = result.equityCurve[0] ?? initial;
    let drawdown = 0;
    for (const equity of result.equityCurve) {
      peak = Math.max(peak,equity);
      if (peak > 0) drawdown = Math.max(drawdown,(peak-equity)/peak);
    }
    return Object.freeze({name,returnPct,maxDrawdownPct:drawdown});
  });
  const returns = scenarios.map(x=>x.returnPct);
  return Object.freeze({
    baselineReturnPct: scenarios[0]!.returnPct,
    worstReturnPct: Math.min(...returns),
    bestReturnPct: Math.max(...returns),
    averageReturnPct: returns.reduce((s,x)=>s+x,0)/returns.length,
    scenarios:Object.freeze(scenarios),
  });
}
