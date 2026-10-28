import type { RateLimitPolicy } from "./types.js";

export type ApiEnvironment = "development" | "test" | "production";

export interface ApiConfig {
  readonly environment: ApiEnvironment;
  readonly host: string;
  readonly port: number;
  readonly corsOrigins: readonly string[];
  readonly rateLimit: RateLimitPolicy;
  readonly maxBodyBytes: number;
  /**
   * "supabase" verifies Supabase-issued JWTs (required in production).
   * "static" accepts the development bearer token and is refused in production.
   */
  readonly authMode: "supabase" | "static";
  readonly supabaseUrl?: string;
  readonly supabaseJwtAudience: string;
  readonly dataDir: string;
  readonly logLevel: "debug" | "info" | "warn" | "error";
}

export class ConfigurationError extends Error {
  readonly problems: readonly string[];
  constructor(problems: readonly string[]) {
    super("invalid API configuration: " + problems.join("; "));
    this.name = "ConfigurationError";
    this.problems = problems;
  }
}

const DEFAULT_DEV_ORIGINS = Object.freeze([
  "http://127.0.0.1:4173",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
]);

function parsePort(raw: string | undefined, problems: string[]): number {
  if (raw === undefined || raw === "") return 3000;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    problems.push(`API_PORT must be an integer between 1 and 65535 (got "${raw}")`);
    return 3000;
  }
  return port;
}

function parseOrigins(raw: string | undefined, environment: ApiEnvironment, problems: string[]): readonly string[] {
  if (raw === undefined || raw.trim() === "") {
    if (environment === "production") problems.push("CORS_ORIGINS must list the exact browser origins in production");
    return DEFAULT_DEV_ORIGINS;
  }
  const origins = raw.split(",").map((value) => value.trim()).filter((value) => value.length > 0);
  for (const origin of origins) {
    if (origin === "*" || origin.includes("*")) {
      problems.push(`CORS_ORIGINS must be explicit, no wildcards (got "${origin}")`);
      continue;
    }
    try {
      const url = new URL(origin);
      if (url.origin !== origin || (url.protocol !== "https:" && url.protocol !== "http:")) {
        problems.push(`CORS_ORIGINS entry must be a bare http(s) origin without a path (got "${origin}")`);
      }
    } catch {
      problems.push(`CORS_ORIGINS entry is not a valid origin (got "${origin}")`);
    }
  }
  return origins;
}

function parseSupabaseUrl(raw: string | undefined, environment: ApiEnvironment, problems: string[]): string | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const value = raw.trim().replace(/\/+$/, "");
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && !(environment !== "production" && url.protocol === "http:")) {
      problems.push("SUPABASE_URL must use https");
    }
  } catch {
    problems.push(`SUPABASE_URL is not a valid URL (got "${raw}")`);
    return undefined;
  }
  return value;
}

/**
 * Reads and validates configuration once, at startup.
 *
 * Production fails fast when authentication or CORS is not configured, instead
 * of booting an API that would silently accept the development token.
 */
export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const problems: string[] = [];
  const rawEnvironment = (env.TRADELEDGER_ENV ?? env.NODE_ENV ?? "development").toLowerCase();
  const environment: ApiEnvironment =
    rawEnvironment === "production" ? "production"
      : rawEnvironment === "test" ? "test"
        : "development";

  const host = (env.API_HOST ?? "").trim() || (environment === "production" ? "" : "127.0.0.1");
  if (host === "") problems.push("API_HOST must be set in production (the platform assigns a bind address)");

  const port = parsePort(env.API_PORT, problems);
  const corsOrigins = parseOrigins(env.CORS_ORIGINS, environment, problems);
  const supabaseUrl = parseSupabaseUrl(env.SUPABASE_URL, environment, problems);

  const authMode: ApiConfig["authMode"] = supabaseUrl === undefined ? "static" : "supabase";
  if (environment === "production") {
    if (authMode === "static") {
      problems.push("SUPABASE_URL is required in production; the static development token must never be a production credential");
    }
  }

  const windowMs = Number(env.RATE_LIMIT_WINDOW_MS ?? 60_000);
  const maxRequests = Number(env.RATE_LIMIT_MAX_REQUESTS ?? 120);
  if (!Number.isInteger(windowMs) || windowMs <= 0) problems.push("RATE_LIMIT_WINDOW_MS must be a positive integer");
  if (!Number.isInteger(maxRequests) || maxRequests <= 0) problems.push("RATE_LIMIT_MAX_REQUESTS must be a positive integer");

  const maxBodyBytes = Number(env.API_MAX_BODY_BYTES ?? 32 * 1024);
  if (!Number.isInteger(maxBodyBytes) || maxBodyBytes <= 0 || maxBodyBytes > 8 * 1024 * 1024) {
    problems.push("API_MAX_BODY_BYTES must be a positive integer up to 8388608");
  }

  const logLevelRaw = (env.API_LOG_LEVEL ?? (environment === "production" ? "info" : "debug")).toLowerCase();
  if (logLevelRaw !== "debug" && logLevelRaw !== "info" && logLevelRaw !== "warn" && logLevelRaw !== "error") {
    problems.push(`API_LOG_LEVEL must be debug, info, warn or error (got "${env.API_LOG_LEVEL}")`);
  }

  if (problems.length > 0) throw new ConfigurationError(problems);

  return {
    environment,
    host,
    port,
    corsOrigins,
    rateLimit: { windowMs, maxRequests },
    maxBodyBytes,
    authMode,
    ...(supabaseUrl === undefined ? {} : { supabaseUrl }),
    supabaseJwtAudience: (env.SUPABASE_JWT_AUDIENCE ?? "authenticated").trim() || "authenticated",
    dataDir: (env.TRADELEDGER_DATA_DIR ?? "").trim() || ".tradeledger-data",
    logLevel: logLevelRaw as ApiConfig["logLevel"],
  };
}