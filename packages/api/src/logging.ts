/**
 * Minimal structured (JSON lines) request/event logger with secret redaction.
 *
 * One JSON object per line so any log collector can ingest it without a
 * parser. Values under sensitive-looking keys are replaced with "[redacted]"
 * before serialization; token material, cookies and passwords never reach
 * stdout. Level filtering is fixed at construction.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SENSITIVE_KEY = /(pass(word)?|secret|token|authorization|cookie|api[-_]?key|service[-_]?role|bearer|private[-_]?key)/i;

const MAX_VALUE_CHARS = 2_000;

export interface Logger {
  debug(event: string, fields?: Record<string, unknown>): void;
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

function redact(value: unknown, key = "", depth = 0): unknown {
  if (SENSITIVE_KEY.test(key)) return "[redacted]";
  if (value === null || typeof value !== "object") {
    if (typeof value === "string" && value.length > MAX_VALUE_CHARS) return value.slice(0, MAX_VALUE_CHARS) + "…";
    return value;
  }
  if (depth >= 6) return "[depth-limit]";
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, "", depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [childKey, redact(childValue, childKey, depth + 1)]),
  );
}

export interface LoggerOptions {
  readonly level?: LogLevel;
  readonly now?: () => Date;
  readonly write?: (line: string) => void;
  readonly service?: string;
}

/** Discards everything; used when no logger is configured (e.g. unit tests). */
export const noopLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export function createLogger(options: LoggerOptions = {}): Logger {
  const threshold = LEVEL_ORDER[options.level ?? "info"];
  const now = options.now ?? (() => new Date());
  const write = options.write ?? ((line: string) => process.stdout.write(line + "\n"));
  const service = options.service ?? "tradeledger-api";

  const emit = (level: Exclude<LogLevel, "debug"> | "debug", event: string, fields?: Record<string, unknown>): void => {
    if (LEVEL_ORDER[level] < threshold) return;
    const entry: Record<string, unknown> = {
      ts: now().toISOString(),
      level,
      service,
      event,
      ...(fields === undefined ? {} : (redact(fields) as Record<string, unknown>)),
    };
    try {
      write(JSON.stringify(entry));
    } catch {
      write(JSON.stringify({ ts: entry.ts, level, service, event, error: "log serialization failed" }));
    }
  };

  return {
    debug: (event, fields) => emit("debug", event, fields),
    info: (event, fields) => emit("info", event, fields),
    warn: (event, fields) => emit("warn", event, fields),
    error: (event, fields) => emit("error", event, fields),
  };
}