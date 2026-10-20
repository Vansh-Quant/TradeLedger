// Types mirror the TradeLedger HTTP API. Fields are optional because the
// frontend never assumes a value exists — missing data renders "Unavailable".

export type Side = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT" | "STOP" | "STOP_LIMIT";
export type TimeInForce = "DAY" | "GTC" | "IOC" | "FOK";
export type OrderStatus =
  | "CREATED" | "SUBMITTED" | "ACKNOWLEDGED" | "PARTIALLY_FILLED" | "FILLED"
  | "CANCEL_REQUESTED" | "CANCELLED" | "REJECTED" | "EXPIRED";

export interface Order {
  orderId: string;
  accountId?: string | undefined;
  symbol?: string | undefined;
  side?: Side | undefined;
  type?: OrderType | undefined;
  quantity?: number | undefined;
  filledQuantity?: number | undefined;
  limitPrice?: number | null | undefined;
  stopPrice?: number | null | undefined;
  averageFillPrice?: number | null | undefined;
  timeInForce?: TimeInForce | undefined;
  status?: OrderStatus | string | undefined;
  rejectReason?: string | null | undefined;
  createdAt?: string | undefined;
  [k: string]: unknown;
}

export interface Position {
  symbol: string;
  quantity?: number | undefined;
  averagePrice?: number | undefined;
  marketPrice?: number | undefined;
  unrealizedPnl?: number | undefined;
  unrealizedPnlPct?: number | undefined;
  exposure?: number | undefined;
  [k: string]: unknown;
}

export interface Execution {
  executionId: string;
  orderId?: string | undefined;
  symbol?: string | undefined;
  side?: Side | undefined;
  quantity?: number | undefined;
  price?: number | undefined;
  venue?: string | undefined;
  fees?: number | undefined;
  timestamp?: string | undefined;
  [k: string]: unknown;
}

export interface RiskLimits {
  maxOrderNotional?: number | undefined;
  maxPositionNotional?: number | undefined;
  maxGrossExposure?: number | undefined;
  maxNetExposure?: number | undefined;
  maxDailyLoss?: number | undefined;
}

export interface AccountContext {
  accountId: string;
  totalEquity?: number | undefined;
  cash?: number | undefined;
  buyingPower?: number | undefined;
  dailyPnl?: number | undefined;
  unrealizedPnl?: number | undefined;
  realizedPnl?: number | undefined;
  grossExposure?: number | undefined;
  netExposure?: number | undefined;
  dailyLoss?: number | undefined;
  marketValue?: number | undefined;
  positions: Position[];
  executions: Execution[];
  limits: RiskLimits;
  raw: unknown;
}

export interface MarketDataQuote {
  kind: "quote";
  instrumentId: string;
  bid: number;
  bidSize: number;
  ask: number;
  askSize: number;
  observedAt: string;
  source?: string | undefined;
}

export interface MarketDataTrade {
  kind: "trade";
  instrumentId: string;
  price: number;
  quantity: number;
  observedAt: string;
  side?: "buy" | "sell" | undefined;
  source?: string | undefined;
}

export interface MarketDataBar {
  kind: "bar";
  instrumentId: string;
  timeframeSeconds: number;
  startAt: string;
  endAt: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source?: string | undefined;
}

/** Mirrors the domain MarketDataState returned by GET /api/v1/market-data. */
export interface MarketDataState {
  instrumentId: string;
  latestQuote?: MarketDataQuote | undefined;
  latestTrade?: MarketDataTrade | undefined;
  latestBar?: MarketDataBar | undefined;
  lastSequence: number;
  lastObservedAt: string;
  lastReceivedAt: string;
}

export interface SubmitOrderIntent {
  accountId: string;
  symbol: string;
  side: Side;
  type: OrderType;
  quantity: number;
  limitPrice?: number | undefined;
  stopPrice?: number | undefined;
  timeInForce: TimeInForce;
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public body?: unknown) {
    super(message);
  }
}


export interface WorkstationDemoData {
  accountId: string;
  asOf: string;
  context: AccountContext;
  orders: Order[];
  executions: Execution[];
  marketData: Array<{ symbol: string; bid: number; ask: number; last: number; change: number; changePct: number; volume: number; status: string }>;
  analytics: {
    equityCurve: number[];
    dailyReturns: number[];
    metrics: { totalReturnPct: number; sharpe: number; sortino: number; maxDrawdownPct: number; winRatePct: number; profitFactor: number; trades: number };
    attribution: Array<{ strategy: string; pnl: number }>;
  };
  research: Array<{ id: string; title: string; status: string; updatedAt: string; score: number; samples: number }>;
  strategies: Array<{ id: string; name: string; state: string; version: string; returnPct: number; sharpe: number; allocationPct: number }>;
  journal: Array<{ id: string; date: string; symbol: string; setup: string; bias: string; rating: number; pnl: number; note: string }>;
  chart: { symbol: string; candles: number[]; volume: number[] };
}


export interface CompetitionParticipant {
  participantId: string;
  accountId: string;
  state: string;
  registeredAt: string;
}

export interface CompetitionLeaderboardEntry {
  participantId: string;
  rank: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  returnPct: number;
}

export interface CompetitionSnapshot {
  competition: {
    config: { id: string; name: string; maxParticipants: number; allowedInstruments: string[]; maxOrderNotional: number; maxOrdersPerParticipantPerSecond: number; startingEquity: number };
    state: string;
    participants: CompetitionParticipant[];
    version: number;
    sequence: number;
  };
  policy: {
    version: number;
    tradingEnabled: boolean;
    emergencyHalt: boolean;
    allowedInstruments: string[];
    maxOrderNotional: number;
    maxOrdersPerParticipantPerSecond: number;
  };
  leaderboard: CompetitionLeaderboardEntry[];
  audit: Array<{ sequence: number; action: string; targetId?: string; outcome: string; reason?: string; occurredAt: string }>;
}
