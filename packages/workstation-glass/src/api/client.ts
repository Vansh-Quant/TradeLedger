import { getApiConfig } from "./config";
import { supabase } from "@/lib/supabase-client";
import {
  normalizeAccountContext,
  normalizeMarketDataStates,
  normalizeOrders,
  toSubmitOrderBody,
} from "./normalize";
import {
  ApiError,
  type BacktestRequest,
  type CompetitionSnapshot,
  type InstrumentResolve,
  type MarketDataHistory,
  type MarketDataStatus,
  type ResearchRun,
  type StrategyCatalog,
  type SubmitOrderIntent,
} from "./types";

// Single entry point for all TradeLedger HTTP communication.

/**
 * Access token for the API boundary. Priority:
 *  1. an explicitly configured token (development / Settings),
 *  2. the active Supabase session token (the normal authenticated path),
 *  3. no Authorization header (the API answers 401 and the app routes to
 *     sign-in).
 * The API verifies Supabase tokens itself against the project's JWKS.
 */
async function accessToken(): Promise<string | undefined> {
  const cfg = getApiConfig();
  if (cfg.token) return cfg.token;
  if (!supabase) return undefined;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? undefined;
  } catch {
    return undefined;
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { idempotent?: boolean } = {},
): Promise<T> {
  const cfg = getApiConfig();
  if (!cfg.baseUrl) throw new ApiError("API base URL not configured", 0);
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  const bearer = await accessToken();
  if (bearer) headers.set("Authorization", `Bearer ${bearer}`);
  if (init.idempotent) headers.set("Idempotency-Key", crypto.randomUUID());

  let res: Response;
  try {
    res = await fetch(cfg.baseUrl.replace(/\/$/, "") + path, { ...init, headers });
  } catch (error) {
    // Preserve aborts so callers can distinguish a cancelled run from an outage.
    if (error instanceof Error && error.name === "AbortError") throw new ApiError("cancelled", 0);
    throw new ApiError("Cannot reach TradeLedger API", 0);
  }
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* plain text */
  }
  if (!res.ok) {
    // The API wraps failures as { error: { code, message } } (see packages/api/src/errors.ts).
    let msg = `HTTP ${res.status}`;
    if (body && typeof body === "object") {
      const record = body as Record<string, unknown>;
      if (typeof record["message"] === "string") msg = record["message"];
      else if (record["error"] && typeof record["error"] === "object") {
        const nested = (record["error"] as Record<string, unknown>)["message"];
        if (typeof nested === "string") msg = nested;
      } else if (typeof record["error"] === "string") msg = record["error"];
    }
    throw new ApiError(msg, res.status, body);
  }
  return body as T;
}

export const api = {
  health: () => request<unknown>("/health"),
  ready: () => request<unknown>("/ready"),
  accountContext: async (accountId: string) =>
    normalizeAccountContext(
      await request<unknown>(`/api/v1/accounts/${encodeURIComponent(accountId)}/context`),
      accountId,
    ),
  orders: async (accountId: string) =>
    normalizeOrders(
      await request<unknown>(`/api/v1/accounts/${encodeURIComponent(accountId)}/orders`),
    ),
  /** Authoritative market-data states. Empty array means nothing has been ingested. */
  marketData: async (accountId: string) =>
    normalizeMarketDataStates(
      await request<unknown>(`/api/v1/market-data?accountId=${encodeURIComponent(accountId)}`),
    ),
  submitOrder: (intent: SubmitOrderIntent) =>
    request<unknown>("/api/v1/orders", {
      method: "POST",
      body: JSON.stringify(toSubmitOrderBody(intent)),
      idempotent: true,
    }),
  competition: async () => request<CompetitionSnapshot>("/api/v1/competition"),
  competitionControl: (
    action:
      | "start"
      | "pause"
      | "resume"
      | "complete"
      | "halt"
      | "suspend_participant"
      | "resume_participant"
      | "liquidate_participant",
    expectedVersion: number,
    participantId?: string,
  ) =>
    request<
      | CompetitionSnapshot
      | { applied: boolean; reason: string; competition: CompetitionSnapshot["competition"] }
    >("/api/v1/competition/control", {
      method: "POST",
      body: JSON.stringify({
        action,
        expectedVersion,
        requestId: crypto.randomUUID(),
        ...(participantId === undefined ? {} : { participantId }),
      }),
    }),
  competitionPolicy: (patch: Partial<CompetitionSnapshot["policy"]>) =>
    request<CompetitionSnapshot>("/api/v1/competition/policy", {
      method: "POST",
      body: JSON.stringify(patch),
    }),
  cancelOrder: (orderId: string, accountId: string) =>
    request<unknown>(
      `/api/v1/orders/${encodeURIComponent(orderId)}?accountId=${encodeURIComponent(accountId)}`,
      { method: "POST", body: JSON.stringify({ action: "CANCEL" }), idempotent: true },
    ),
  /** Candles for one symbol, interval and window. Never fabricated client-side. */
  marketDataHistory: (
    accountId: string,
    symbol: string,
    interval: string,
    startAt: string,
    endAt: string,
  ) =>
    request<MarketDataHistory>(
      `/api/v1/market-data/${encodeURIComponent(symbol)}/history` +
        `?accountId=${encodeURIComponent(accountId)}` +
        `&interval=${encodeURIComponent(interval)}` +
        `&startAt=${encodeURIComponent(startAt)}` +
        `&endAt=${encodeURIComponent(endAt)}`,
    ),
  /** Provider-backed symbol resolution for instrument search. */
  resolveInstrument: (accountId: string, symbol: string) =>
    request<InstrumentResolve>(
      `/api/v1/market-data/${encodeURIComponent(symbol)}/resolve?accountId=${encodeURIComponent(accountId)}`,
    ),
  /** Provider health plus ingestion state for the Market Data page. */
  marketDataStatus: (accountId: string) =>
    request<MarketDataStatus>(
      `/api/v1/market-data/status?accountId=${encodeURIComponent(accountId)}`,
    ),
  /** Declarative strategy catalog compiled and executed by the backend. */
  strategyCatalog: () => request<StrategyCatalog>("/api/v1/research/strategies"),
  /** Runs a backtest; pass a signal to cancel the run in flight. */
  runBacktest: (body: BacktestRequest, signal?: AbortSignal) =>
    request<ResearchRun>("/api/v1/research/backtests", {
      method: "POST",
      body: JSON.stringify(body),
      ...(signal === undefined ? {} : { signal }),
    }),
  listBacktests: (accountId: string) =>
    request<{ runs: ResearchRun[] }>(
      `/api/v1/research/backtests?accountId=${encodeURIComponent(accountId)}`,
    ),
  getBacktest: (accountId: string, runId: string) =>
    request<ResearchRun>(
      `/api/v1/research/backtests/${encodeURIComponent(runId)}?accountId=${encodeURIComponent(accountId)}`,
    ),
};
