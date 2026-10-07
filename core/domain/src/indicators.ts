import type { Bar } from "./market-data.js";

export function simpleMovingAverage(values: readonly number[], period: number): number | undefined {
  if (!Number.isInteger(period) || period <= 0) throw new Error("period must be a positive integer");
  if (values.length < period) return undefined;
  return values.slice(-period).reduce((sum, value) => sum + value, 0) / period;
}

export function exponentialMovingAverage(values: readonly number[], period: number): number | undefined {
  if (!Number.isInteger(period) || period <= 0) throw new Error("period must be a positive integer");
  if (values.length < period) return undefined;
  let ema = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  const multiplier = 2 / (period + 1);
  for (const value of values.slice(period)) ema = (value - ema) * multiplier + ema;
  return ema;
}

export function returns(values: readonly number[]): readonly number[] {
  const result: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const previous = values[i - 1]!;
    if (previous <= 0 || !Number.isFinite(previous)) throw new Error("prices must be positive and finite");
    result.push(values[i]! / previous - 1);
  }
  return Object.freeze(result);
}

export function barCloses(bars: readonly Bar[]): readonly number[] {
  return Object.freeze(bars.map((bar) => bar.close));
}

export function volatility(values: readonly number[]): number {
  const r = returns(values);
  if (r.length < 2) return 0;
  const mean = r.reduce((s, x) => s + x, 0) / r.length;
  return Math.sqrt(r.reduce((s, x) => s + (x - mean) ** 2, 0) / (r.length - 1));
}
