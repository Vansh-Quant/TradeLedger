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

/** GET /api/v1/market-data/{symbol}/history */
export interface HistoryCoverage {
  requestedFrom?: string | undefined;
  requestedTo?: string | undefined;
  returnedFrom?: string | null;
  returnedTo?: string | null;
  count: number;
}

export interface MarketDataHistory {
  instrumentId: string;
  provider: string;
  interval?: string | undefined;
  sourceInterval?: string | undefined;
  aggregated?: boolean | undefined;
  bars: MarketDataBar[];
  coverage?: HistoryCoverage | undefined;
}

/** GET /api/v1/market-data/{symbol}/resolve */
export interface InstrumentResolve {
  symbol: string;
  provider: string;
  interval: string;
  supported: boolean;
  detail: string;
  latestBar?: MarketDataBar | undefined;
}

/** GET /api/v1/market-data/status */
export interface MarketDataIngestionStatus {
  providerId: string;
  polling: boolean;
  instruments: string[];
  barInterval: string;
  barPollIntervalMs: number;
  quotePollIntervalMs: number;
  lastPollAt?: string | undefined;
  lastAcceptedAt?: string | undefined;
  lastErrorAt?: string | undefined;
  lastError?: string | undefined;
  acceptedPoints: number;
  skippedPoints: number;
  quoteUnavailable: string[];
}

export interface MarketDataStatus {
  provider: { providerId: string; healthy: boolean; checkedAt: string; message?: string | undefined };
  ingestion: MarketDataIngestionStatus | null;
}

/** Research / backtesting contract (GET+POST /api/v1/research/*) */
export interface StrategyParameterSpec {
  key: string;
  label: string;
  help: string;
  default: number;
  min: number;
  max: number;
  integer: boolean;
}

export interface StrategySpecDefinition {
  kind: string;
  name: string;
  description: string;
  parameters: StrategyParameterSpec[];
}

export interface StrategyCatalog {
  strategies: StrategySpecDefinition[];
  kinds: string[];
}

export interface ResearchMetrics {
  netPnl: number;
  returnPct: number;
  maxDrawdownPct: number;
  winRatePct: number;
  profitFactor: number;
  tradeCount: number;
  sharpeLike: number;
}

export interface ResearchTrade {
  entryAt: string;
  exitAt: string;
  side: "long" | "short";
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
}

export interface ResearchRun {
  runId: string;
  createdAt: string;
  accountId: string;
  instrumentId: string;
  interval: string;
  requested: { from: string; to: string };
  dataRange: { from: string; to: string; count: number; source?: string | undefined };
  strategy: { kind: string; name: string; version: number; parameters: Record<string, number> };
  assumptions: {
    initialCapital: number;
    quantity: number;
    commissionPerTrade: number;
    slippageBps: number;
    execution: "next-bar-open";
  };
  report: {
    strategyId: string;
    performance: ResearchMetrics;
    validation: { passed: boolean; failures: string[] };
    robustness: { tradeCount: number; positiveTradePct: number; worstTrade: number; bestTrade: number };
  };
  equityCurve: { at: string; equity: number }[];
  trades: ResearchTrade[];
  warnings: string[];
}

export interface BacktestRequest {
  accountId: string;
  instrumentId: string;
  interval: string;
  startAt: string;
  endAt: string;
  strategy: { kind: string; parameters?: Record<string, number> };
  initialCapital?: number;
  quantity?: number;
  commissionPerTrade?: number;
  slippageBps?: number;
  save?: boolean;
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public body?: unknown) {
    super(message);
  }
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
