import { describe, expect, it } from "vitest";
import { daysAgoIso, isoDay, todayIso, validateSpec } from "@/lib/research-view";
import type { StrategyCatalog } from "@/api/types";

const catalog: StrategyCatalog = {
  kinds: ["sma_crossover", "rsi_reversion"],
  strategies: [
    {
      kind: "sma_crossover",
      name: "SMA crossover",
      description: "Fast SMA crossing over slow SMA goes long.",
      parameters: [
        { key: "fast", label: "Fast", help: "fast period", min: 2, max: 200, default: 10, integer: true },
        { key: "slow", label: "Slow", help: "slow period", min: 5, max: 400, default: 30, integer: true },
      ],
    },
    {
      kind: "rsi_reversion",
      name: "RSI reversion",
      description: "Buy oversold, sell overbought.",
      parameters: [
        { key: "oversold", label: "Oversold", help: "oversold level", min: 1, max: 49, default: 30, integer: true },
        { key: "overbought", label: "Overbought", help: "overbought level", min: 51, max: 99, default: 70, integer: true },
      ],
    },
  ],
};

describe("validateSpec", () => {
  it("accepts a valid spec and fills in documented defaults", () => {
    const { spec, error } = validateSpec(JSON.stringify({ kind: "sma_crossover", parameters: { fast: 5 } }), catalog);
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
    const { spec, error } = validateSpec(JSON.stringify({ kind: "sma_crossover", parameters: { turbo: 1 } }), catalog);
    expect(spec).toBeNull();
    expect(error).toContain("unknown parameter");
    expect(error).toContain("fast");
  });

  it("rejects non-numeric, non-integer and out-of-range values", () => {
    expect(validateSpec(JSON.stringify({ kind: "sma_crossover", parameters: { fast: "ten" } }), catalog).error)
      .toContain("finite number");
    expect(validateSpec(JSON.stringify({ kind: "sma_crossover", parameters: { fast: 10.5, slow: 30 } }), catalog).error)
      .toContain("integer");
    expect(validateSpec(JSON.stringify({ kind: "sma_crossover", parameters: { fast: 9999, slow: 30 } }), catalog).error)
      .toContain("between");
  });

  it("enforces cross-parameter ordering rules", () => {
    expect(validateSpec(JSON.stringify({ kind: "sma_crossover", parameters: { fast: 30, slow: 10 } }), catalog).error)
      .toContain("fast < slow");
    // The RSI ordering rule is defensive: its min/max ranges already force
    // oversold < overbought, so an in-range inversion cannot be constructed.
    expect(validateSpec(JSON.stringify({ kind: "rsi_reversion", parameters: { oversold: 49, overbought: 51 } }), catalog).error)
      .toBeNull();
    expect(validateSpec(JSON.stringify({ kind: "rsi_reversion", parameters: { oversold: 80, overbought: 20 } }), catalog).error)
      .toContain("between");
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
