import { getApiConfig } from "./config";
import {
  normalizeAccountContext, normalizeMarketDataStates, normalizeOrders, toSubmitOrderBody,
} from "./normalize";
import {
  ApiError, type CompetitionSnapshot, type SubmitOrderIntent,
} from "./types";

// Single entry point for all TradeLedger HTTP communication.

async function request<T>(path: string, init: RequestInit & { idempotent?: boolean } = {}): Promise<T> {
  const cfg = getApiConfig();
  if (!cfg.baseUrl) throw new ApiError("API base URL not configured", 0);
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  if (cfg.token) headers.set("Authorization", `Bearer ${cfg.token}`);
  if (init.idempotent) headers.set("Idempotency-Key", crypto.randomUUID());

  let res: Response;
  try {
    res = await fetch(cfg.baseUrl.replace(/\/$/, "") + path, { ...init, headers });
  } catch {
    throw new ApiError("Cannot reach TradeLedger API", 0);
  }
  const text = await res.text();
  let body: unknown = text;
  try { body = text ? JSON.parse(text) : null; } catch { /* plain text */ }
  if (!res.ok) {
    const msg = (body && typeof body === "object" && ("message" in body || "error" in body))
      ? String((body as Record<string, unknown>)["message"] ?? (body as Record<string, unknown>)["error"])
      : `HTTP ${res.status}`;
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
    normalizeOrders(await request<unknown>(`/api/v1/accounts/${encodeURIComponent(accountId)}/orders`)),
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
  competition: async () =>
    request<CompetitionSnapshot>("/api/v1/competition"),
  competitionControl: (
    action: "start" | "pause" | "resume" | "complete" | "halt" | "suspend_participant" | "resume_participant" | "liquidate_participant",
    expectedVersion: number,
    participantId?: string,
  ) =>
    request<CompetitionSnapshot | { applied: boolean; reason: string; competition: CompetitionSnapshot["competition"] }>(
      "/api/v1/competition/control",
      {
        method: "POST",
        body: JSON.stringify({
          action,
          expectedVersion,
          requestId: crypto.randomUUID(),
          ...(participantId === undefined ? {} : { participantId }),
        }),
      },
    ),
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
};
