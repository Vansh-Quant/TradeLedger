// Adapters from TradeLedger HTTP payloads to workstation view models.
//
// The API serialises application results directly (see packages/api/src/server.ts
// and jsonSafe). These functions read those shapes — they never derive, estimate
// or invent financial values. Anything the backend does not provide stays
// undefined so the UI can render "Unavailable".

import type {
  AccountContext,
  Execution,
  MarketDataBar,
  MarketDataState,
  MarketDataTrade,
  Order,
  Position,
  RiskLimits,
  SubmitOrderIntent,
} from "./types";

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

export function num(src: unknown, ...keys: string[]): number | undefined {
  for (const key of keys) {
    let v: unknown = src;
    for (const k of key.split(".")) v = isObj(v) ? v[k] : undefined;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return undefined;
}

export function arr(src: unknown, ...keys: string[]): Obj[] {
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

const upper = (v: string | undefined) => v?.toUpperCase();

/** Unwraps a `{ data }` transport envelope when present. */
export function unwrapData(raw: unknown): unknown {
  return isObj(raw) && isObj(raw["data"]) ? raw["data"] : raw;
}

/** Unwraps `{ data }` envelopes and the `{ context }` trading-context envelope. */
function contextScope(raw: unknown): Obj {
  const unwrapped = unwrapData(raw);
  if (isObj(unwrapped) && isObj(unwrapped["context"])) return unwrapped["context"] as Obj;
  return isObj(unwrapped) ? unwrapped : {};
}

export function normalizePosition(p: Obj): Position {
  return {
    ...p,
    symbol: str(p, "symbol", "instrumentId", "instrument") ?? "—",
    quantity: num(p, "quantity", "qty", "netQuantity"),
    averagePrice: num(p, "averagePrice", "avgPrice", "averageCost"),
    marketPrice: num(p, "marketPrice", "lastPrice", "markPrice"),
    unrealizedPnl: num(p, "unrealizedPnl", "unrealizedPnL"),
    unrealizedPnlPct: num(p, "unrealizedPnlPct", "unrealizedPnlPercent", "pnlPct"),
    exposure: num(p, "exposure", "notional", "marketValue"),
  };
}

export function normalizeExecution(e: Obj): Execution {
  return {
    ...e,
    executionId: str(e, "executionId", "id", "fillId") ?? "—",
    orderId: str(e, "orderId"),
    symbol: str(e, "symbol", "instrumentId", "instrument"),
    side: upper(str(e, "side")) as Execution["side"],
    quantity: num(e, "quantity", "qty"),
    price: num(e, "price", "fillPrice"),
    venue: str(e, "venue"),
    fees: num(e, "fees", "fee", "commission"),
    timestamp: str(e, "timestamp", "executedAt", "time", "createdAt"),
  };
}

/**
 * Accepts a bare domain order or a `{ order, state }` entry from
 * `GET /api/v1/accounts/{id}/orders`, which returns
 * `{ orders: [{ order, state }] }`.
 */
export function normalizeOrder(raw: unknown): Order {
  const o = isObj(raw) && isObj(raw["order"]) ? (raw["order"] as Obj) : isObj(raw) ? raw : {};
  return {
    ...o,
    orderId: str(o, "orderId", "id") ?? "—",
    symbol: str(o, "symbol", "instrumentId", "instrument"),
    side: upper(str(o, "side")) as Order["side"],
    type: upper(str(o, "type", "orderType"))?.replace(/-/g, "_") as Order["type"],
    quantity: num(o, "quantity", "qty"),
    filledQuantity: num(o, "filledQuantity", "filledQty", "filled"),
    limitPrice: num(o, "limitPrice"),
    stopPrice: num(o, "stopPrice"),
    averageFillPrice: num(o, "averageFillPrice", "avgFillPrice"),
    timeInForce: upper(str(o, "timeInForce", "tif")) as Order["timeInForce"],
    status: upper(str(o, "status", "state"))?.replace(/[\s-]/g, "_"),
    rejectReason: str(o, "rejectReason", "rejectionReason", "reason") ?? null,
    createdAt: str(o, "createdAt", "timestamp", "created"),
  };
}

export function normalizeOrders(raw: unknown): Order[] {
  const list = Array.isArray(raw) ? raw.filter(isObj) : arr(raw, "orders", "data", "items");
  return list.map(normalizeOrder);
}

export function normalizeAccountContext(raw: unknown, accountId: string): AccountContext {
  const c = contextScope(raw);
  const portfolio =
    isObj(c["accountPortfolio"]) && isObj((c["accountPortfolio"] as Obj)["portfolio"])
      ? (c["accountPortfolio"] as Obj)["portfolio"]
      : c["portfolio"];
  const scope: Obj = { ...c, portfolio };

  const limits: RiskLimits = {
    maxOrderNotional: num(scope, "riskLimits.maxOrderNotional", "limits.maxOrderNotional"),
    maxPositionNotional: num(scope, "riskLimits.maxPositionNotional", "limits.maxPositionNotional"),
    maxGrossExposure: num(scope, "riskLimits.maxGrossExposure", "limits.maxGrossExposure"),
    maxNetExposure: num(scope, "riskLimits.maxNetExposure", "limits.maxNetExposure"),
    maxDailyLoss: num(scope, "riskLimits.maxDailyLoss", "limits.maxDailyLoss"),
  };

  return {
    accountId: str(c, "accountId") || accountId,
    // Not part of TradingContext today: present in the demo fixture only.
    totalEquity: num(scope, "totalEquity", "equity", "account.equity"),
    cash: num(scope, "cash", "account.cash"),
    // BuyingPower is a capacity object on the wire.
    buyingPower: num(scope, "buyingPower.totalCapacity", "buyingPower"),
    dailyPnl: num(scope, "dailyPnl", "dailyPnL", "pnl.daily"),
    unrealizedPnl: num(scope, "portfolio.unrealizedPnl", "unrealizedPnl", "pnl.unrealized"),
    realizedPnl: num(scope, "portfolio.realizedPnl", "realizedPnl", "pnl.realized"),
    grossExposure: num(scope, "portfolio.grossExposure", "grossExposure", "exposure.gross"),
    netExposure: num(scope, "portfolio.netExposure", "netExposure", "exposure.net"),
    dailyLoss: num(scope, "dailyLoss", "risk.dailyLoss"),
    marketValue: num(scope, "portfolio.marketValue", "marketValue"),
    positions: arr(scope, "portfolio.positions", "positions").map(normalizePosition),
    executions: arr(scope, "executions", "fills", "recentExecutions").map(normalizeExecution),
    limits,
    raw,
  };
}

function normalizeMarketDataBar(raw: unknown): MarketDataBar | undefined {
  if (!isObj(raw)) return undefined;
  const close = num(raw, "close");
  const timeframeSeconds = num(raw, "timeframeSeconds");
  const startAt = str(raw, "startAt");
  const endAt = str(raw, "endAt");
  if (
    close === undefined ||
    timeframeSeconds === undefined ||
    startAt === undefined ||
    endAt === undefined
  ) {
    return undefined;
  }
  return {
    kind: "bar",
    instrumentId: str(raw, "instrumentId") ?? "—",
    timeframeSeconds,
    startAt,
    endAt,
    open: num(raw, "open") ?? close,
    high: num(raw, "high") ?? close,
    low: num(raw, "low") ?? close,
    close,
    volume: num(raw, "volume") ?? 0,
    ...(str(raw, "source") === undefined ? {} : { source: str(raw, "source") }),
  };
}

function normalizeMarketDataTrade(raw: unknown): MarketDataTrade | undefined {
  if (!isObj(raw)) return undefined;
  const price = num(raw, "price");
  const observedAt = str(raw, "observedAt");
  if (price === undefined || observedAt === undefined) return undefined;
  return {
    kind: "trade",
    instrumentId: str(raw, "instrumentId") ?? "—",
    price,
    quantity: num(raw, "quantity") ?? 0,
    observedAt,
    ...(str(raw, "side") === "buy" || str(raw, "side") === "sell"
      ? { side: str(raw, "side") as "buy" | "sell" }
      : {}),
    ...(str(raw, "source") === undefined ? {} : { source: str(raw, "source") }),
  };
}

function normalizeMarketDataQuote(raw: unknown): MarketDataState["latestQuote"] {
  if (!isObj(raw)) return undefined;
  const bid = num(raw, "bid");
  const ask = num(raw, "ask");
  if (bid === undefined || ask === undefined) return undefined;
  const source = str(raw, "source");
  return {
    kind: "quote",
    instrumentId: str(raw, "instrumentId") ?? "—",
    bid,
    bidSize: num(raw, "bidSize") ?? 0,
    ask,
    askSize: num(raw, "askSize") ?? 0,
    observedAt: str(raw, "observedAt") ?? "",
    ...(source === undefined ? {} : { source }),
  };
}

/** Reads `GET /api/v1/market-data` states without inventing quotes. */
export function normalizeMarketDataStates(raw: unknown): MarketDataState[] {
  const list = Array.isArray(raw)
    ? raw.filter(isObj)
    : arr(unwrapData(raw), "states", "marketData", "data", "items");
  return list.flatMap((state) => {
    const instrumentId = str(state, "instrumentId");
    if (instrumentId === undefined) return [];
    const quote = normalizeMarketDataQuote(state["latestQuote"]);
    const trade = normalizeMarketDataTrade(state["latestTrade"]);
    const bar = normalizeMarketDataBar(state["latestBar"]);
    return [
      {
        instrumentId,
        ...(quote === undefined ? {} : { latestQuote: quote }),
        ...(trade === undefined ? {} : { latestTrade: trade }),
        ...(bar === undefined ? {} : { latestBar: bar }),
        lastSequence: num(state, "lastSequence") ?? 0,
        lastObservedAt: str(state, "lastObservedAt") ?? "",
        lastReceivedAt: str(state, "lastReceivedAt") ?? "",
      },
    ];
  });
}

/**
 * Maps the view-level order intent onto the domain command accepted by
 * `POST /api/v1/orders`: `instrumentId` plus lowercase enums.
 */
export function toSubmitOrderBody(intent: SubmitOrderIntent): Record<string, unknown> {
  return {
    accountId: intent.accountId,
    instrumentId: intent.symbol.trim(),
    side: intent.side.toLowerCase(),
    type: intent.type.toLowerCase().replace(/_/g, "-"),
    quantity: intent.quantity,
    ...(intent.limitPrice === undefined ? {} : { limitPrice: intent.limitPrice }),
    ...(intent.stopPrice === undefined ? {} : { stopPrice: intent.stopPrice }),
    timeInForce: intent.timeInForce.toLowerCase(),
  };
}
