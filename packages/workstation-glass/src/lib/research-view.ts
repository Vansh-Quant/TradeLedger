import type { ResearchRun, StrategyCatalog, StrategySpecDefinition } from "@/api/types";

/** Date helpers shared by the Research workspace. */
export function isoDay(day: string, end = false): string {
  return `${day}T${end ? "23:59:59.999" : "00:00:00.000"}Z`;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysAgoIso(days: number, nowMs = Date.now()): string {
  return new Date(nowMs - days * 86_400_000).toISOString().slice(0, 10);
}

/** Starter specification opened in the Builder when the URL carries none. */
export const DEFAULT_SPEC = JSON.stringify(
  { kind: "sma_crossover", parameters: { fast: 10, slow: 30 } },
  null,
  2,
);

/** Specification text a catalog entry represents, using its documented defaults. */
export function specJsonFor(definition: StrategySpecDefinition): string {
  return JSON.stringify(
    {
      kind: definition.kind,
      parameters: Object.fromEntries(definition.parameters.map((p) => [p.key, p.default])),
    },
    null,
    2,
  );
}

/**
 * Searchable text for a persisted run. Every field is one the backend actually
 * recorded — nothing is inferred.
 */
export function runSearchText(run: ResearchRun): string {
  return [
    run.runId,
    run.createdAt.slice(0, 10),
    run.instrumentId,
    run.interval,
    run.strategy.kind,
    run.strategy.name,
    `v${run.strategy.version}`,
    run.dataRange.source ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

/** Whitespace-separated AND search over persisted runs; empty query keeps all. */
export function filterRuns(runs: readonly ResearchRun[], query: string): ResearchRun[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...runs];
  return runs.filter((run) => {
    const haystack = runSearchText(run);
    return terms.every((term) => haystack.includes(term));
  });
}

export interface RunComparison {
  /** Differences that make a side-by-side result misleading. */
  readonly blocking: readonly string[];
  /** Differences worth stating even when the runs are comparable. */
  readonly notes: readonly string[];
  readonly comparable: boolean;
}

/**
 * Decides whether two persisted runs may be compared honestly. Strategy,
 * version, market, timeframe and execution assumptions must match; coverage and
 * date-range differences are reported but do not block the comparison.
 */
export function compareRuns(a: ResearchRun, b: ResearchRun): RunComparison {
  const blocking: string[] = [];
  const notes: string[] = [];
  if (a.strategy.kind !== b.strategy.kind) {
    blocking.push(`strategy differs: ${a.strategy.kind} vs ${b.strategy.kind}`);
  }
  if (a.strategy.version !== b.strategy.version) {
    blocking.push(`strategy version differs: v${a.strategy.version} vs v${b.strategy.version}`);
  }
  if (a.instrumentId !== b.instrumentId) {
    blocking.push(`instrument differs: ${a.instrumentId} vs ${b.instrumentId}`);
  }
  if (a.interval !== b.interval) {
    blocking.push(`timeframe differs: ${a.interval} vs ${b.interval}`);
  }
  const assumptionPairs: Array<[string, number, number]> = [
    ["initial capital", a.assumptions.initialCapital, b.assumptions.initialCapital],
    ["quantity", a.assumptions.quantity, b.assumptions.quantity],
    ["fee per trade", a.assumptions.commissionPerTrade, b.assumptions.commissionPerTrade],
    ["slippage (bps)", a.assumptions.slippageBps, b.assumptions.slippageBps],
  ];
  for (const [label, left, right] of assumptionPairs) {
    if (left !== right) blocking.push(`${label} differs: ${left} vs ${right}`);
  }
  if (JSON.stringify(a.strategy.parameters) !== JSON.stringify(b.strategy.parameters)) {
    blocking.push("strategy parameters differ");
  }
  if (a.requested.from !== b.requested.from || a.requested.to !== b.requested.to) {
    notes.push(`requested window differs: ${a.requested.from} → ${a.requested.to} vs ${b.requested.from} → ${b.requested.to}`);
  }
  if (a.dataRange.from !== b.dataRange.from || a.dataRange.to !== b.dataRange.to) {
    notes.push(`executed coverage differs: ${a.dataRange.count} bars vs ${b.dataRange.count} bars`);
  }
  const overlaps = a.dataRange.from <= b.dataRange.to && b.dataRange.from <= a.dataRange.to;
  if (!overlaps) blocking.push("executed data ranges do not overlap");
  return { blocking, notes, comparable: blocking.length === 0 };
}

/**
 * Client-side mirror of the backend strategy validation (`validateStrategySpec`
 * in the domain), so the editor reports problems immediately. The backend
 * remains authoritative: it re-validates every submission.
 */
export function validateSpec(text: string, catalog: StrategyCatalog | undefined):
  { spec: { kind: string; parameters: Record<string, number> } | null; error: string | null } {
  if (catalog === undefined) return { spec: null, error: "Strategy catalog unavailable — cannot validate yet." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { spec: null, error: `Invalid JSON: ${error instanceof Error ? error.message : "parse error"}` };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { spec: null, error: "Strategy must be a JSON object with a kind and parameters." };
  }
  const record = parsed as Record<string, unknown>;
  if (typeof record["kind"] !== "string" || !catalog.kinds.includes(record["kind"])) {
    return { spec: null, error: `kind must be one of: ${catalog.kinds.join(", ")}` };
  }
  const definition = catalog.strategies.find((item) => item.kind === record["kind"]);
  if (definition === undefined) return { spec: null, error: `kind "${String(record["kind"])}" is not in the catalog.` };
  const rawParameters = record["parameters"] ?? {};
  if (typeof rawParameters !== "object" || rawParameters === null || Array.isArray(rawParameters)) {
    return { spec: null, error: "parameters must be an object." };
  }
  const parameters: Record<string, number> = {};
  for (const [key, value] of Object.entries(rawParameters as Record<string, unknown>)) {
    const spec = definition.parameters.find((item) => item.key === key);
    if (spec === undefined) {
      const valid = definition.parameters.map((p) => p.key).join(", ");
      return { spec: null, error: `unknown parameter "${key}" for ${definition.kind}; valid: ${valid || "none"}` };
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return { spec: null, error: `parameter "${key}" must be a finite number.` };
    }
    if (spec.integer && !Number.isInteger(value)) {
      return { spec: null, error: `parameter "${key}" must be an integer.` };
    }
    if (value < spec.min || value > spec.max) {
      return { spec: null, error: `parameter "${key}" must be between ${spec.min} and ${spec.max}.` };
    }
    parameters[key] = value;
  }
  // Missing parameters fall back to the documented defaults, like the backend.
  const resolved = Object.fromEntries(definition.parameters.map((p) => [p.key, parameters[p.key] ?? p.default]));
  if (definition.kind === "sma_crossover" && resolved["fast"]! >= resolved["slow"]!) {
    return { spec: null, error: "sma_crossover requires fast < slow." };
  }
  if (definition.kind === "rsi_reversion" && resolved["oversold"]! >= resolved["overbought"]!) {
    return { spec: null, error: "rsi_reversion requires oversold < overbought." };
  }
  return { spec: { kind: definition.kind, parameters: resolved }, error: null };
}