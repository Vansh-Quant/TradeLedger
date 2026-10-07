import type { Bar } from "./market-data.js";
import type { StrategyDefinition, StrategySignal } from "./strategy.js";

export interface BacktestTrade {
  readonly entryAt: string; readonly exitAt: string; readonly side: "long" | "short";
  readonly entryPrice: number; readonly exitPrice: number; readonly quantity: number; readonly pnl: number;
}

export interface BacktestResult {
  readonly strategyId: string; readonly initialCapital: number; readonly finalCapital: number;
  readonly trades: readonly BacktestTrade[]; readonly equityCurve: readonly number[];
}

function positive(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(field + " must be positive and finite");
  return value;
}

export function runBacktest(input: {
  readonly strategy: StrategyDefinition;
  readonly bars: readonly Bar[];
  readonly initialCapital: number;
  readonly quantity?: number;
  readonly commissionPerTrade?: number;
}): BacktestResult {
  const initial = positive(input.initialCapital, "initialCapital");
  const quantity = positive(input.quantity ?? 1, "quantity");
  const commission = input.commissionPerTrade ?? 0;
  if (!Number.isFinite(commission) || commission < 0) throw new Error("commissionPerTrade must be non-negative and finite");
  let capital = initial;
  let side: "long" | "short" | undefined;
  let entryPrice = 0;
  let entryAt = "";
  const trades: BacktestTrade[] = [];
  const equity: number[] = [capital];
  for (let i = 0; i < input.bars.length; i++) {
    const bar = input.bars[i]!;
    const closes = input.bars.slice(0, i + 1).map((x) => x.close);
    const signal: StrategySignal = input.strategy.evaluate({
      index: i, timestamp: bar.endAt, closes,
    });
    const desired = signal === "long" || signal === "short" ? signal : undefined;
    if (side === undefined && desired !== undefined) {
      side = desired; entryPrice = bar.close; entryAt = bar.endAt;
    } else if (side !== undefined && desired !== side) {
      const pnl = side === "long"
        ? (bar.close - entryPrice) * quantity - commission
        : (entryPrice - bar.close) * quantity - commission;
      capital += pnl;
      trades.push(Object.freeze({
        entryAt, exitAt: bar.endAt, side, entryPrice, exitPrice: bar.close, quantity, pnl,
      }));
      side = desired;
      if (side !== undefined) { entryPrice = bar.close; entryAt = bar.endAt; }
    }
    const unrealized = side === undefined ? 0 : side === "long"
      ? (bar.close - entryPrice) * quantity : (entryPrice - bar.close) * quantity;
    equity.push(capital + unrealized);
  }
  if (side !== undefined && input.bars.length > 0) {
    const bar = input.bars[input.bars.length - 1]!;
    const pnl = side === "long"
      ? (bar.close - entryPrice) * quantity - commission
      : (entryPrice - bar.close) * quantity - commission;
    capital += pnl;
    trades.push(Object.freeze({
      entryAt, exitAt: bar.endAt, side, entryPrice, exitPrice: bar.close, quantity, pnl,
    }));
    equity[equity.length - 1] = capital;
  }
  return Object.freeze({
    strategyId: input.strategy.id, initialCapital: initial, finalCapital: capital,
    trades: Object.freeze(trades), equityCurve: Object.freeze(equity),
  });
}
