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

function nonNegative(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(field + " must be non-negative and finite");
  return value;
}

export function runBacktest(input: {
  readonly strategy: StrategyDefinition;
  readonly bars: readonly Bar[];
  readonly initialCapital: number;
  readonly quantity?: number;
  readonly commissionPerTrade?: number;
  readonly slippageBps?: number;
}): BacktestResult {
  const initial = positive(input.initialCapital, "initialCapital");
  const quantity = positive(input.quantity ?? 1, "quantity");
  const commission = nonNegative(input.commissionPerTrade ?? 0, "commissionPerTrade");
  const slippageBps = nonNegative(input.slippageBps ?? 0, "slippageBps");
  const slip = slippageBps / 10_000;

  let capital = initial;
  let side: "long" | "short" | undefined;
  let entryPrice = 0;
  let entryAt = "";
  const trades: BacktestTrade[] = [];
  const equity: number[] = [capital];
  let executionCount = 0;
  let turnover = 0;

  const fillPrice = (bar: Bar, direction: "buy" | "sell"): number =>
    direction === "buy" ? bar.open * (1 + slip) : bar.open * (1 - slip);

  for (let i = 0; i < input.bars.length; i++) {
    const bar = input.bars[i]!;
    const closes = input.bars.slice(0, i + 1).map((x) => x.close);
    const signal: StrategySignal = input.strategy.evaluate({
      index: i, timestamp: bar.endAt, closes,
    });

    // A signal generated from bar N is executed at bar N+1 open. This prevents
    // using a completed close to trade at that same close.
    if (i + 1 < input.bars.length) {
      const next = input.bars[i + 1]!;
      const desired = signal === "long" || signal === "short" ? signal : undefined;
      if (side === undefined && desired !== undefined) {
        side = desired;
        entryPrice = fillPrice(next, desired === "long" ? "buy" : "sell");
        entryAt = next.startAt;
        capital -= commission;
        executionCount += 1;
        turnover += entryPrice * quantity;
      } else if (side !== undefined && desired !== side) {
        const exitPrice = fillPrice(next, side === "long" ? "sell" : "buy");
        const pnl = side === "long"
          ? (exitPrice - entryPrice) * quantity - commission
          : (entryPrice - exitPrice) * quantity - commission;
        capital += pnl;
        executionCount += 1;
        turnover += exitPrice * quantity;
        trades.push(Object.freeze({
          entryAt, exitAt: next.startAt, side, entryPrice, exitPrice, quantity, pnl,
        }));
        side = desired;
        if (side !== undefined) {
          entryPrice = fillPrice(next, side === "long" ? "buy" : "sell");
          entryAt = next.startAt;
          capital -= commission;
          executionCount += 1;
          turnover += entryPrice * quantity;
        }
      }
    }

    const mark = bar.close;
    const unrealized = side === undefined ? 0
      : side === "long" ? (mark - entryPrice) * quantity
      : (entryPrice - mark) * quantity;
    equity.push(capital + unrealized);
  }

  if (side !== undefined && input.bars.length > 0) {
    const bar = input.bars[input.bars.length - 1]!;
    const exitPrice = bar.close;
    const pnl = side === "long"
      ? (exitPrice - entryPrice) * quantity - commission
      : (entryPrice - exitPrice) * quantity - commission;
    capital += pnl;
    executionCount += 1;
    turnover += exitPrice * quantity;
    trades.push(Object.freeze({
      entryAt, exitAt: bar.endAt, side, entryPrice, exitPrice, quantity, pnl,
    }));
    equity[equity.length - 1] = capital;
  }

  return Object.freeze({
    strategyId: input.strategy.id,
    initialCapital: initial,
    finalCapital: capital,
    trades: Object.freeze(trades),
    equityCurve: Object.freeze(equity),
    executionCount,
    turnover,
  });
}
