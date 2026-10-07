import type { Bar } from "./market-data.js";

function positiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(field + " must be a positive integer");
  return value;
}

export function rollingMean(values: readonly number[], period: number): readonly (number | undefined)[] {
  const p = positiveInteger(period, "period");
  return Object.freeze(values.map((_, i) =>
    i + 1 < p ? undefined : values.slice(i + 1 - p, i + 1).reduce((s, x) => s + x, 0) / p));
}

export function rollingStdDev(values: readonly number[], period: number): readonly (number | undefined)[] {
  const p = positiveInteger(period, "period");
  return Object.freeze(values.map((_, i) => {
    if (i + 1 < p) return undefined;
    const window = values.slice(i + 1 - p, i + 1);
    const mean = window.reduce((s, x) => s + x, 0) / p;
    return Math.sqrt(window.reduce((s, x) => s + (x - mean) ** 2, 0) / p);
  }));
}

export function rollingZScore(values: readonly number[], period: number): readonly (number | undefined)[] {
  const means = rollingMean(values, period);
  const stds = rollingStdDev(values, period);
  return Object.freeze(values.map((value, i) => {
    const mean = means[i], std = stds[i];
    return mean === undefined || std === undefined ? undefined : std === 0 ? 0 : (value - mean) / std;
  }));
}

export function relativeStrengthIndex(values: readonly number[], period: number): readonly (number | undefined)[] {
  const p = positiveInteger(period, "period");
  const result: (number | undefined)[] = values.map(() => undefined);
  if (values.length <= p) return Object.freeze(result);
  let gains = 0, losses = 0;
  for (let i = 1; i <= p; i++) {
    const delta = values[i]! - values[i - 1]!;
    if (delta >= 0) gains += delta; else losses -= delta;
  }
  for (let i = p; i < values.length; i++) {
    if (i > p) {
      const delta = values[i]! - values[i - 1]!;
      gains = (gains * (p - 1) + Math.max(delta, 0)) / p;
      losses = (losses * (p - 1) + Math.max(-delta, 0)) / p;
    } else {
      gains /= p; losses /= p;
    }
    result[i] = losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);
  }
  return Object.freeze(result);
}

export function trueRange(bar: Bar, previousClose?: number): number {
  return Math.max(
    bar.high - bar.low,
    previousClose === undefined ? 0 : Math.abs(bar.high - previousClose),
    previousClose === undefined ? 0 : Math.abs(bar.low - previousClose),
  );
}

export function averageTrueRange(bars: readonly Bar[], period: number): readonly (number | undefined)[] {
  const p = positiveInteger(period, "period");
  const tr = bars.map((bar, i) => trueRange(bar, i === 0 ? undefined : bars[i - 1]!.close));
  return rollingMean(tr, p);
}
