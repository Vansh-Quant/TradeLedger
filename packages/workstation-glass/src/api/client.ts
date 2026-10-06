import { getApiConfig } from "./config";
import {
  ApiError, type AccountContext, type Execution, type Order, type Position,
  type SubmitOrderIntent, type WorkstationDemoData,
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

// ---- tolerant normalisation (reads values only; never derives them) ----
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

function num(src: unknown, ...keys: string[]): number | undefined {
  for (const key of keys) {
    let v: unknown = src;
    for (const k of key.split(".")) v = isObj(v) ? v[k] : undefined;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return undefined;
}
function arr(src: unknown, ...keys: string[]): Obj[] {
  for (const key of keys) {
    let v: unknown = src;
    for (const k of key.split(".")) v = isObj(v) ? v[k] : undefined;
    if (Array.isArray(v)) return v.filter(isObj);
  }
  return [];
}
const str = (o: Obj, ...keys: string[]) => {
  for (const k of keys) if (o[k] != null) return String(o[k]);
  return undefined;
};

function normPosition(p: Obj): Position {
  return {
    ...p,
    symbol: str(p, "symbol", "instrument", "instrumentId") ?? "—",
    quantity: num(p, "quantity", "qty", "netQuantity"),
    averagePrice: num(p, "averagePrice", "avgPrice", "averageCost"),
    marketPrice: num(p, "marketPrice", "lastPrice", "markPrice"),
    unrealizedPnl: num(p, "unrealizedPnl", "unrealizedPnL"),
    unrealizedPnlPct: num(p, "unrealizedPnlPct", "unrealizedPnlPercent", "pnlPct"),
    exposure: num(p, "exposure", "notional", "marketValue"),
  };
}
function normExecution(e: Obj): Execution {
  return {
    ...e,
    executionId: str(e, "executionId", "id", "fillId") ?? "—",
    orderId: str(e, "orderId"),
    symbol: str(e, "symbol", "instrument"),
    side: str(e, "side")?.toUpperCase() as Execution["side"],
    quantity: num(e, "quantity", "qty"),
    price: num(e, "price", "fillPrice"),
    venue: str(e, "venue"),
    fees: num(e, "fees", "fee", "commission"),
    timestamp: str(e, "timestamp", "executedAt", "time", "createdAt"),
  };
}
function normOrder(o: Obj): Order {
  return {
    ...o,
    orderId: str(o, "orderId", "id") ?? "—",
    symbol: str(o, "symbol", "instrument"),
    side: str(o, "side")?.toUpperCase() as Order["side"],
    type: str(o, "type", "orderType")?.toUpperCase().replace("-", "_") as Order["type"],
    quantity: num(o, "quantity", "qty"),
    filledQuantity: num(o, "filledQuantity", "filledQty", "filled"),
    limitPrice: num(o, "limitPrice"),
    stopPrice: num(o, "stopPrice"),
    averageFillPrice: num(o, "averageFillPrice", "avgFillPrice"),
    timeInForce: str(o, "timeInForce", "tif")?.toUpperCase() as Order["timeInForce"],
    status: str(o, "status", "state")?.toUpperCase().replace(/[\s-]/g, "_"),
    rejectReason: str(o, "rejectReason", "rejectionReason", "reason") ?? null,
    createdAt: str(o, "createdAt", "timestamp", "created"),
  };
}

function normContext(raw: unknown, accountId: string): AccountContext {
  const r = isObj(raw) && isObj(raw["data"]) ? raw["data"] : raw;
  return {
    accountId: (isObj(r) && str(r, "accountId")) || accountId,
    totalEquity: num(r, "totalEquity", "equity", "account.equity", "portfolio.equity"),
    cash: num(r, "cash", "account.cash", "portfolio.cash"),
    buyingPower: num(r, "buyingPower", "account.buyingPower", "context.buyingPower.totalCapacity", "buyingPower.totalCapacity"),
    dailyPnl: num(r, "dailyPnl", "dailyPnL", "pnl.daily", "portfolio.dailyPnl"),
    unrealizedPnl: num(r, "unrealizedPnl", "pnl.unrealized", "portfolio.unrealizedPnl"),
    realizedPnl: num(r, "realizedPnl", "pnl.realized", "context.accountPortfolio.portfolio.realizedPnl", "accountPortfolio.portfolio.realizedPnl"),
    grossExposure: num(r, "grossExposure", "exposure.gross", "risk.grossExposure", "context.accountPortfolio.portfolio.grossExposure", "accountPortfolio.portfolio.grossExposure"),
    netExposure: num(r, "netExposure", "exposure.net", "risk.netExposure", "context.accountPortfolio.portfolio.netExposure", "accountPortfolio.portfolio.netExposure"),
    dailyLoss: num(r, "dailyLoss", "risk.dailyLoss"),
    marketValue: num(r, "marketValue", "portfolio.marketValue", "context.accountPortfolio.portfolio.marketValue", "accountPortfolio.portfolio.marketValue"),
    positions: arr(r, "positions", "portfolio.positions", "context.accountPortfolio.portfolio.positions", "accountPortfolio.portfolio.positions").map(normPosition),
    executions: arr(r, "executions", "fills", "recentExecutions").map(normExecution),
    limits: {
      maxOrderNotional: num(r, "limits.maxOrderNotional", "riskLimits.maxOrderNotional", "risk.limits.maxOrderNotional"),
      maxPositionNotional: num(r, "limits.maxPositionNotional", "riskLimits.maxPositionNotional", "risk.limits.maxPositionNotional"),
      maxGrossExposure: num(r, "limits.maxGrossExposure", "riskLimits.maxGrossExposure", "risk.limits.maxGrossExposure"),
      maxNetExposure: num(r, "limits.maxNetExposure", "riskLimits.maxNetExposure", "risk.limits.maxNetExposure"),
      maxDailyLoss: num(r, "limits.maxDailyLoss", "riskLimits.maxDailyLoss", "risk.limits.maxDailyLoss"),
    },
    raw,
  };
}

export const api = {
  health: () => request<unknown>("/health"),
  ready: () => request<unknown>("/ready"),
  workstationDemo: async (accountId: string) => {
    const raw = await request<unknown>(
      `/api/v1/workstation/demo?accountId=${encodeURIComponent(accountId)}`,
    );
    const value = isObj(raw) && isObj(raw["data"]) ? raw["data"] : raw;
    const demo = value as WorkstationDemoData;

    return {
      ...demo,
      context: normContext(demo.context, accountId),
    };
  },
  accountContext: async (accountId: string) =>
    normContext(await request<unknown>(`/api/v1/accounts/${encodeURIComponent(accountId)}/context`), accountId),
  orders: async (accountId: string) => {
    const raw = await request<unknown>(`/api/v1/accounts/${encodeURIComponent(accountId)}/orders`);
    const list = Array.isArray(raw) ? raw.filter(isObj) : arr(raw, "orders", "data", "items");
    return list.map(normOrder);
  },
  submitOrder: (intent: SubmitOrderIntent) =>
    request<unknown>("/api/v1/orders", { method: "POST", body: JSON.stringify(intent), idempotent: true }),
  cancelOrder: (orderId: string, accountId: string) =>
    request<unknown>(
      `/api/v1/orders/${encodeURIComponent(orderId)}?accountId=${encodeURIComponent(accountId)}`,
      { method: "POST", body: JSON.stringify({ action: "CANCEL" }), idempotent: true },
    ),
};
