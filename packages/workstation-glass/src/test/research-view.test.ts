import { describe, expect, it } from "vitest";
import {
  DEFAULT_SPEC,
  compareRuns,
  daysAgoIso,
  filterRuns,
  isoDay,
  specJsonFor,
  todayIso,
  validateSpec,
} from "@/lib/research-view";
import type { ResearchRun, StrategyCatalog } from "@/api/types";

const catalog: StrategyCatalog = {
  kinds: ["sma_crossover", "rsi_reversion"],
  strategies: [
    {
      kind: "sma_crossover",
      name: "SMA crossover",
      description: "Fast SMA crossing over slow SMA goes long.",
      parameters: [
        {
          key: "fast",
          label: "Fast",
          help: "fast period",
          min: 2,
          max: 200,
          default: 10,
          integer: true,
        },
        {
          key: "slow",
          label: "Slow",
          help: "slow period",
          min: 5,
          max: 400,
          default: 30,
          integer: true,
        },
      ],
    },
    {
      kind: "rsi_reversion",
      name: "RSI reversion",
      description: "Buy oversold, sell overbought.",
      parameters: [
        {
          key: "oversold",
          label: "Oversold",
          help: "oversold level",
          min: 1,
          max: 49,
          default: 30,
          integer: true,
        },
        {
          key: "overbought",
          label: "Overbought",
          help: "overbought level",
          min: 51,
          max: 99,
          default: 70,
          integer: true,
        },
      ],
    },
  ],
};

describe("validateSpec", () => {
  it("accepts a valid spec and fills in documented defaults", () => {
    const { spec, error } = validateSpec(
      JSON.stringify({ kind: "sma_crossover", parameters: { fast: 5 } }),
      catalog,
    );
    expect(error).toBeNull();
    expect(spec).toEqual({ kind: "sma_crossover", parameters: { fast: 5, slow: 30 } });
  });

  it("rejects malformed JSON with the parse error", () => {
    const { spec, error } = validateSpec("{ not json", catalog);
    expect(spec).toBeNull();
    expect(error).toContain("Invalid JSON");
  });

  it("rejects a non-object payload", () => {
    expect(validateSpec("[]", catalog).error).toContain("JSON object");
    expect(validateSpec("null", catalog).error).toContain("JSON object");
  });

  it("rejects a kind outside the catalog", () => {
    const { spec, error } = validateSpec(JSON.stringify({ kind: "martingale" }), catalog);
    expect(spec).toBeNull();
    expect(error).toContain("kind must be one of");
  });

  it("rejects unknown parameters with the valid list", () => {
    const { spec, error } = validateSpec(
      JSON.stringify({ kind: "sma_crossover", parameters: { turbo: 1 } }),
      catalog,
    );
    expect(spec).toBeNull();
    expect(error).toContain("unknown parameter");
    expect(error).toContain("fast");
  });

  it("rejects non-numeric, non-integer and out-of-range values", () => {
    expect(
      validateSpec(JSON.stringify({ kind: "sma_crossover", parameters: { fast: "ten" } }), catalog)
        .error,
    ).toContain("finite number");
    expect(
      validateSpec(
        JSON.stringify({ kind: "sma_crossover", parameters: { fast: 10.5, slow: 30 } }),
        catalog,
      ).error,
    ).toContain("integer");
    expect(
      validateSpec(
        JSON.stringify({ kind: "sma_crossover", parameters: { fast: 9999, slow: 30 } }),
        catalog,
      ).error,
    ).toContain("between");
  });

  it("enforces cross-parameter ordering rules", () => {
    expect(
      validateSpec(
        JSON.stringify({ kind: "sma_crossover", parameters: { fast: 30, slow: 10 } }),
        catalog,
      ).error,
    ).toContain("fast < slow");
    // The RSI ordering rule is defensive: its min/max ranges already force
    // oversold < overbought, so an in-range inversion cannot be constructed.
    expect(
      validateSpec(
        JSON.stringify({ kind: "rsi_reversion", parameters: { oversold: 49, overbought: 51 } }),
        catalog,
      ).error,
    ).toBeNull();
    expect(
      validateSpec(
        JSON.stringify({ kind: "rsi_reversion", parameters: { oversold: 80, overbought: 20 } }),
        catalog,
      ).error,
    ).toContain("between");
  });

  it("cannot validate before the catalog is loaded", () => {
    const { spec, error } = validateSpec("{}", undefined);
    expect(spec).toBeNull();
    expect(error).toContain("catalog unavailable");
  });
});

describe("research date helpers", () => {
  it("builds inclusive day boundaries", () => {
    expect(isoDay("2026-10-20")).toBe("2026-10-20T00:00:00.000Z");
    expect(isoDay("2026-10-20", true)).toBe("2026-10-20T23:59:59.999Z");
  });

  it("derives rolling dates deterministically from an injected clock", () => {
    const now = Date.parse("2026-10-20T12:00:00Z");
    expect(daysAgoIso(365, now)).toBe("2025-10-20");
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

/** Minimal persisted-run fixture: only the fields the search/compare logic reads. */
function makeRun(overrides: Partial<ResearchRun> = {}): ResearchRun {
  const base: ResearchRun = {
    runId: "run-aaaa-1111",
    createdAt: "2026-10-01T09:30:00.000Z",
    accountId: "ACC-APP",
    instrumentId: "EURUSD",
    interval: "1d",
    requested: { from: "2025-10-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" },
    dataRange: { from: "2025-10-01", to: "2026-09-30", count: 250, source: "biquote" },
    strategy: {
      kind: "sma_crossover",
      name: "SMA crossover",
      version: 1,
      parameters: { fast: 10, slow: 30 },
    },
    assumptions: {
      initialCapital: 100_000,
      quantity: 1,
      commissionPerTrade: 0,
      slippageBps: 0,
      execution: "next-bar-open",
    },
    report: {
      strategyId: "sma_crossover",
      performance: {
        netPnl: 1_000,
        returnPct: 0.01,
        maxDrawdownPct: 0.02,
        winRatePct: 0.55,
        profitFactor: 1.4,
        tradeCount: 20,
        sharpeLike: 0.9,
      },
      validation: { passed: true, failures: [] },
      robustness: { tradeCount: 20, positiveTradePct: 55, worstTrade: -200, bestTrade: 400 },
    },
    equityCurve: [{ at: "2026-10-01", equity: 101_000 }],
    trades: [],
    warnings: [],
  };
  return { ...base, ...overrides };
}

describe("filterRuns", () => {
  const runs = [
    makeRun(),
    makeRun({
      runId: "run-bbbb-2222",
      instrumentId: "XAUUSD",
      interval: "1h",
      createdAt: "2026-10-05T09:30:00.000Z",
    }),
    makeRun({
      runId: "run-cccc-3333",
      strategy: {
        kind: "rsi_reversion",
        name: "RSI reversion",
        version: 2,
        parameters: { oversold: 30, overbought: 70 },
      },
    }),
  ];

  it("keeps every run for an empty query", () => {
    expect(filterRuns(runs, "   ")).toHaveLength(3);
  });

  it("matches symbol, timeframe, strategy and date terms together", () => {
    expect(filterRuns(runs, "xauusd").map((r) => r.runId)).toEqual(["run-bbbb-2222"]);
    expect(filterRuns(runs, "1h xauusd").map((r) => r.runId)).toEqual(["run-bbbb-2222"]);
    expect(filterRuns(runs, "rsi_reversion v2").map((r) => r.runId)).toEqual(["run-cccc-3333"]);
    expect(filterRuns(runs, "2026-10-05").map((r) => r.runId)).toEqual(["run-bbbb-2222"]);
  });

  it("returns nothing when no run matches", () => {
    expect(filterRuns(runs, "nas100")).toEqual([]);
  });
});

describe("compareRuns", () => {
  it("treats identical runs as comparable", () => {
    const verdict = compareRuns(makeRun(), makeRun());
    expect(verdict.comparable).toBe(true);
    expect(verdict.blocking).toEqual([]);
  });

  it("blocks comparison when strategy, market or assumptions differ", () => {
    const verdict = compareRuns(
      makeRun(),
      makeRun({
        runId: "run-dddd-4444",
        instrumentId: "XAUUSD",
        interval: "4h",
        strategy: {
          kind: "sma_crossover",
          name: "SMA crossover",
          version: 2,
          parameters: { fast: 10, slow: 30 },
        },
        assumptions: { ...makeRun().assumptions, slippageBps: 2 },
      }),
    );
    expect(verdict.comparable).toBe(false);
    expect(verdict.blocking.join(" ")).toContain("strategy version differs");
    expect(verdict.blocking.join(" ")).toContain("instrument differs");
    expect(verdict.blocking.join(" ")).toContain("timeframe differs");
    expect(verdict.blocking.join(" ")).toContain("slippage (bps) differs");
  });

  it("reports coverage differences as notes without blocking", () => {
    const verdict = compareRuns(
      makeRun(),
      makeRun({
        runId: "run-eeee-5555",
        dataRange: { from: "2025-11-01", to: "2026-09-30", count: 220, source: "biquote" },
      }),
    );
    expect(verdict.comparable).toBe(true);
    expect(verdict.notes.join(" ")).toContain("executed coverage differs");
  });

  it("blocks comparison when the executed data ranges never overlap", () => {
    const verdict = compareRuns(
      makeRun(),
      makeRun({
        runId: "run-ffff-6666",
        dataRange: { from: "2020-01-01", to: "2020-12-31", count: 250, source: "biquote" },
      }),
    );
    expect(verdict.comparable).toBe(false);
    expect(verdict.blocking.join(" ")).toContain("do not overlap");
  });
});

describe("spec helpers", () => {
  it("emits a valid default starter specification", () => {
    expect(validateSpec(DEFAULT_SPEC, catalog).error).toBeNull();
  });

  it("renders a catalog entry with its documented defaults", () => {
    const text = specJsonFor(catalog.strategies[0]!);
    expect(JSON.parse(text)).toEqual({ kind: "sma_crossover", parameters: { fast: 10, slow: 30 } });
    expect(validateSpec(text, catalog).error).toBeNull();
  });
});
