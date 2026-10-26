import { describe, expect, it } from "vitest";
import {
  compileStrategy, createBar, minimumBarsForSpec, runResearchBacktest,
  validateStrategySpec, STRATEGY_SPEC_KINDS,
  type InstrumentId, type StrategySpec,
} from "../../core/domain/src/index.js";

const EURUSD = "EURUSD" as InstrumentId;

/** Deterministic synthetic daily bars: a rising leg then a falling leg. */
function bars(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const close = i < count / 2 ? 100 + i : 100 + (count / 2) - (i - count / 2);
    const open = i === 0 ? 100 : (i < count / 2 ? close - 1 : close + 1);
    const start = new Date(Date.UTC(2026, 0, 1 + i)).toISOString();
    return createBar({
      instrumentId: EURUSD, timeframeSeconds: 86_400,
      startAt: start, endAt: new Date(Date.parse(start) + 86_400_000).toISOString(),
      open, high: Math.max(open, close) + 0.4, low: Math.min(open, close) - 0.4,
      close, volume: 0, source: "biquote",
    });
  });
}

function baseInput(overrides: Partial<Parameters<typeof runResearchBacktest>[0]> = {}) {
  return {
    runId: "run-1",
    createdAt: "2026-10-25T00:00:00.000Z",
    accountId: "ACC-RESEARCH",
    instrumentId: "EURUSD",
    interval: "1d",
    requestedFrom: "2026-01-01T00:00:00.000Z",
    requestedTo: "2026-03-01T00:00:00.000Z",
    spec: validateStrategySpec({ kind: "sma_crossover", parameters: { fast: 2, slow: 5 } }),
    bars: bars(40),
    initialCapital: 100_000,
    quantity: 1,
    commissionPerTrade: 0,
    slippageBps: 0,
    ...overrides,
  };
}

describe("strategy specifications", () => {
  it("accepts every built-in kind and fills default parameters", () => {
    for (const kind of STRATEGY_SPEC_KINDS) {
      const spec = validateStrategySpec({ kind, parameters: {} });
      expect(spec.kind).toBe(kind);
    }
    const spec = validateStrategySpec({ kind: "sma_crossover" });
    expect(spec.parameters).toEqual({ fast: 10, slow: 30 });
  });

  it("rejects unknown kinds, unknown parameters and out-of-range values", () => {
    expect(() => validateStrategySpec({ kind: "arbitrary_code", parameters: {} })).toThrow('strategy kind "arbitrary_code" is not supported');
    expect(() => validateStrategySpec({ kind: "sma_crossover", parameters: { warp: 3 } })).toThrow('strategy parameter "warp" is not valid');
    expect(() => validateStrategySpec({ kind: "sma_crossover", parameters: { fast: 1, slow: 5 } })).toThrow("must be between 2 and 500");
    expect(() => validateStrategySpec({ kind: "sma_crossover", parameters: { fast: 2.5, slow: 5 } })).toThrow("must be an integer");
    expect(() => validateStrategySpec("sma_crossover")).toThrow("strategy must be an object");
    expect(() => validateStrategySpec({ kind: "sma_crossover", parameters: { fast: "ten", slow: 5 } })).toThrow("must be a finite number");
  });

  it("enforces cross-field constraints and parameter ranges", () => {
    expect(() => validateStrategySpec({ kind: "sma_crossover", parameters: { fast: 30, slow: 30 } })).toThrow("fast window to be smaller than the slow window");
    // RSI bands are range-constrained so oversold can never meet overbought.
    expect(() => validateStrategySpec({ kind: "rsi_reversion", parameters: { oversold: 70, overbought: 30 } }))
      .toThrow('strategy parameter "oversold" must be between 1 and 49');
  });

  it("compiles deterministic signals from visible closes only", () => {
    const spec = validateStrategySpec({ kind: "sma_crossover", parameters: { fast: 2, slow: 4 } });
    const strategy = compileStrategy(spec);
    const rising = [100, 101, 102, 103, 104];
    expect(strategy.evaluate({ index: 4, timestamp: "2026-01-06T00:00:00.000Z", closes: rising })).toBe("long");
    const falling = [104, 103, 102, 101, 100];
    expect(strategy.evaluate({ index: 4, timestamp: "2026-01-06T00:00:00.000Z", closes: falling })).toBe("flat");
    // Not enough history: flat rather than a guess.
    expect(strategy.evaluate({ index: 1, timestamp: "2026-01-02T00:00:00.000Z", closes: [100, 101] })).toBe("flat");
    expect(minimumBarsForSpec(spec)).toBe(6);
  });

  it("compiles RSI reversion signals with Wilder smoothing bounds", () => {
    const spec = validateStrategySpec({ kind: "rsi_reversion", parameters: { period: 5, oversold: 30, overbought: 70 } });
    const strategy = compileStrategy(spec);
    const rising = Array.from({ length: 8 }, (_, i) => 100 + i);
    expect(strategy.evaluate({ index: 7, timestamp: "t", closes: rising })).toBe("short");
    const falling = Array.from({ length: 8 }, (_, i) => 107 - i);
    expect(strategy.evaluate({ index: 7, timestamp: "t", closes: falling })).toBe("long");
    expect(strategy.evaluate({ index: 1, timestamp: "t", closes: [100, 101] })).toBe("flat");
  });
});

describe("research backtest", () => {
  it("is deterministic for identical inputs", () => {
    const first = runResearchBacktest(baseInput());
    const second = runResearchBacktest(baseInput());
    expect(first).toEqual(second);
    expect(first.report.performance).toEqual(second.report.performance);
  });

  it("never trades on the bar it evaluated (no look-ahead)", () => {
    const all = bars(40);
    const truncated = all.slice(0, 25);
    const full = runResearchBacktest(baseInput({ bars: all }));
    const partial = runResearchBacktest(baseInput({ bars: truncated }));

    // The first 25 bars produce identical equity regardless of later data.
    expect(full.equityCurve.slice(0, 25)).toEqual(partial.equityCurve.slice(0, 25));
    expect(full.equityCurve).toHaveLength(all.length + 1);
    expect(partial.equityCurve).toHaveLength(truncated.length + 1);
  });

  it("fills signals at the next bar open, not the evaluated close", () => {
    // A single up bar followed by a flat bar: buy-and-hold evaluates long on
    // bar 0, so the entry must be bar 1's open.
    const start = "2026-01-01T00:00:00.000Z";
    const twoBars = [
      createBar({
        instrumentId: EURUSD, timeframeSeconds: 86_400,
        startAt: start, endAt: "2026-01-02T00:00:00.000Z",
        open: 100, high: 110, low: 99, close: 109, volume: 0,
      }),
      createBar({
        instrumentId: EURUSD, timeframeSeconds: 86_400,
        startAt: "2026-01-02T00:00:00.000Z", endAt: "2026-01-03T00:00:00.000Z",
        open: 105, high: 106, low: 104, close: 106, volume: 0,
      }),
    ];
    const run = runResearchBacktest(baseInput({
      spec: validateStrategySpec({ kind: "buy_and_hold", parameters: {} }),
      bars: twoBars,
    }));
    expect(run.trades).toHaveLength(1);
    expect(run.trades[0]!.entryAt).toBe("2026-01-02T00:00:00.000Z");
    expect(run.trades[0]!.entryPrice).toBe(105);
  });

  it("reports data range, assumptions and honest warnings", () => {
    const run = runResearchBacktest(baseInput({
      requestedFrom: "2025-01-01T00:00:00.000Z",
      bars: bars(5),
      commissionPerTrade: 2,
      slippageBps: 5,
    }));
    expect(run.dataRange.count).toBe(5);
    expect(run.dataRange.from).toBe("2026-01-01T00:00:00.000Z");
    expect(run.assumptions).toMatchObject({
      initialCapital: 100_000, commissionPerTrade: 2, slippageBps: 5, execution: "next-bar-open",
    });
    expect(run.warnings.some((w) => w.includes("provider history starts at"))).toBe(true);
    expect(run.warnings.some((w) => w.includes("needs at least"))).toBe(true);
    expect(run.report.performance.tradeCount).toBeGreaterThanOrEqual(0);
  });

  it("warns instead of faking results when the strategy never trades", () => {
    // Flat-only path: RSI between the bands for a short deterministic series.
    const spec = validateStrategySpec({ kind: "rsi_reversion", parameters: { period: 14, oversold: 5, overbought: 95 } });
    const run = runResearchBacktest(baseInput({ spec, bars: bars(20) }));
    expect(run.trades).toHaveLength(0);
    expect(run.warnings).toContain("the strategy produced no trades in this range");
  });

  it("rejects empty history instead of inventing data", () => {
    expect(() => runResearchBacktest(baseInput({ bars: [] }))).toThrow("at least one historical bar");
    expect(() => runResearchBacktest(baseInput({ bars: bars(1) }))).toThrow("at least two historical bars");
  });

  it("prices fees and slippage into results deterministically", () => {
    const withoutCosts = runResearchBacktest(baseInput({ spec: validateStrategySpec({ kind: "buy_and_hold", parameters: {} }) }));
    const withCosts = runResearchBacktest(baseInput({
      spec: validateStrategySpec({ kind: "buy_and_hold", parameters: {} }),
      commissionPerTrade: 10,
      slippageBps: 20,
    }));
    expect(withCosts.report.performance.netPnl).toBeLessThan(withoutCosts.report.performance.netPnl);
    expect(withCosts.report.performance.netPnl).not.toBe(withoutCosts.report.performance.netPnl);
  });
});