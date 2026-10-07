import type { Bar } from "./market-data.js";

export interface BenchmarkResult {
  readonly initialPrice: number;
  readonly finalPrice: number;
  readonly returnPct: number;
  readonly buyAndHoldPnl: number;
}

export function calculateBuyAndHoldBenchmark(
  bars: readonly Bar[],
  quantity = 1,
): BenchmarkResult {
  if (bars.length < 2) throw new Error("at least two bars are required");
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("quantity must be positive and finite");
  const initialPrice = bars[0]!.close;
  const finalPrice = bars[bars.length - 1]!.close;
  return Object.freeze({
    initialPrice,
    finalPrice,
    returnPct: finalPrice / initialPrice - 1,
    buyAndHoldPnl: (finalPrice - initialPrice) * quantity,
  });
}
