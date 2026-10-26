import type { StrategyCatalog } from "@/api/types";

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