import {
  AllowListedAuthorization,
  InMemoryOrderStateStore,
  InMemoryTradingContext,
  RandomOrderIdGenerator,
  TradingApplicationService,
} from "@tradeledger/application";
import { InMemoryMarketDataStateStore } from "../../../core/infrastructure/src/index.js";
import { createQuote, type InstrumentId } from "@tradeledger/domain";
import {
  createAccount,
  createAccountPortfolio,
  createBuyingPower,
  createPortfolio,
  createRiskLimits,
} from "@tradeledger/domain";
import { createHttpApi, staticBearerAuthenticator } from "./index.js";

const account = createAccount({ id: "ACC-APP", baseCurrency: "USD" });
const context = {
  accountId: account.id,
  accountPortfolio: createAccountPortfolio(account, createPortfolio()),
  buyingPower: createBuyingPower(100_000),
  riskLimits: createRiskLimits({
    maxOrderNotional: 50_000,
    maxPositionNotional: 100_000,
    maxGrossExposure: 200_000,
    maxNetExposure: 150_000,
    maxDailyLoss: 5_000,
  }),
};

const principal = { id: "dev-user", roles: ["trader"] };
const marketData = new InMemoryMarketDataStateStore();
marketData.accept("AAPL" as InstrumentId, createQuote({
  instrumentId: "AAPL" as InstrumentId,
  bid: 100,
  bidSize: 100,
  ask: 100.25,
  askSize: 100,
  observedAt: "2026-10-04T09:30:00Z",
  source: "dev-feed",
}), "2026-10-04T09:30:00Z");

const application = new TradingApplicationService(
  new InMemoryTradingContext([context]),
  new InMemoryOrderStateStore(),
  new AllowListedAuthorization([
    "dev-user:order.read:ACC-APP",
    "dev-user:order.submit:ACC-APP",
    "dev-user:order.cancel:ACC-APP",
    "dev-user:market-data.read:ACC-APP",
    "dev-user:execution.record:ACC-APP",
    "dev-user:event-stream.read:ACC-APP",
  ]),
  new RandomOrderIdGenerator(),
  { now: () => new Date().toISOString() },
  undefined,
  undefined,
  undefined,
  marketData,
);

const workstationDemoData = (accountId: string) => ({
  accountId,
  asOf: "2026-10-06T14:30:00Z",
  context: {
    accountId,
    totalEquity: 103842.75,
    cash: 82714.25,
    buyingPower: 100000,
    dailyPnl: 1842.75,
    unrealizedPnl: 1217.40,
    realizedPnl: 625.35,
    grossExposure: 21128.50,
    netExposure: 13642.25,
    dailyLoss: 0,
    marketValue: 21128.50,
    positions: [
      { symbol: "AAPL", quantity: 80, averagePrice: 100.25, marketPrice: 104.80, unrealizedPnl: 364.00, unrealizedPnlPct: 4.54, exposure: 8384.00 },
      { symbol: "MSFT", quantity: 35, averagePrice: 408.10, marketPrice: 415.60, unrealizedPnl: 262.50, unrealizedPnlPct: 1.84, exposure: 14546.00 },
      { symbol: "NVDA", quantity: -20, averagePrice: 151.20, marketPrice: 148.30, unrealizedPnl: 58.00, unrealizedPnlPct: 1.92, exposure: -2966.00 },
    ],
    limits: { maxOrderNotional: 50000, maxPositionNotional: 100000, maxGrossExposure: 200000, maxNetExposure: 150000, maxDailyLoss: 5000 },
  },
  orders: [
    { orderId: "ORD-DEMO-001", symbol: "AAPL", side: "BUY", type: "LIMIT", quantity: 25, filledQuantity: 0, limitPrice: 103.50, timeInForce: "DAY", status: "SUBMITTED", createdAt: "2026-10-06T14:18:00Z" },
    { orderId: "ORD-DEMO-002", symbol: "MSFT", side: "SELL", type: "LIMIT", quantity: 10, filledQuantity: 4, limitPrice: 416.00, averageFillPrice: 415.80, timeInForce: "DAY", status: "PARTIALLY_FILLED", createdAt: "2026-10-06T13:54:00Z" },
    { orderId: "ORD-DEMO-003", symbol: "NVDA", side: "BUY", type: "LIMIT", quantity: 15, filledQuantity: 15, limitPrice: 147.90, averageFillPrice: 147.90, timeInForce: "DAY", status: "FILLED", createdAt: "2026-10-06T12:40:00Z" },
    { orderId: "ORD-DEMO-004", symbol: "AAPL", side: "SELL", type: "LIMIT", quantity: 10, filledQuantity: 0, limitPrice: 106.00, timeInForce: "GTC", status: "CANCELLED", createdAt: "2026-10-05T15:10:00Z" },
  ],
  executions: [
    { executionId: "EXE-DEMO-001", orderId: "ORD-DEMO-003", symbol: "NVDA", side: "BUY", quantity: 15, price: 147.90, venue: "SIM-XNAS", fees: 0.12, timestamp: "2026-10-06T12:41:12Z" },
    { executionId: "EXE-DEMO-002", orderId: "ORD-DEMO-002", symbol: "MSFT", side: "SELL", quantity: 4, price: 415.80, venue: "SIM-XNAS", fees: 0.14, timestamp: "2026-10-06T13:55:31Z" },
    { executionId: "EXE-DEMO-003", orderId: "ORD-DEMO-005", symbol: "AAPL", side: "BUY", quantity: 30, price: 102.90, venue: "SIM-XNAS", fees: 0.09, timestamp: "2026-10-06T11:18:44Z" },
  ],
  marketData: [
    { symbol: "AAPL", bid: 104.75, ask: 104.80, last: 104.78, change: 1.84, changePct: 1.79, volume: 48213000, status: "OPEN" },
    { symbol: "MSFT", bid: 415.55, ask: 415.60, last: 415.58, change: 3.22, changePct: 0.78, volume: 21654000, status: "OPEN" },
    { symbol: "NVDA", bid: 148.25, ask: 148.30, last: 148.28, change: -1.12, changePct: -0.75, volume: 73421000, status: "OPEN" },
    { symbol: "AMZN", bid: 221.40, ask: 221.55, last: 221.48, change: 2.31, changePct: 1.05, volume: 19324000, status: "OPEN" },
  ],
  analytics: {
    equityCurve: [100000, 100420, 100180, 101050, 100920, 101840, 102410, 101980, 103210, 102760, 103842.75],
    dailyReturns: [0.42, -0.24, 0.87, -0.13, 0.91, 0.56, -0.42, 1.20, -0.44, 1.05],
    metrics: { totalReturnPct: 3.84, sharpe: 1.74, sortino: 2.21, maxDrawdownPct: -0.68, winRatePct: 63.6, profitFactor: 1.92, trades: 22 },
    attribution: [{ strategy: "Mean Reversion", pnl: 982.30 }, { strategy: "Momentum", pnl: 541.20 }, { strategy: "Pairs", pnl: 319.25 }],
  },
  research: [
    { id: "RES-001", title: "AAPL Intraday Mean Reversion", status: "RUNNING", updatedAt: "2026-10-06T13:40:00Z", score: 0.81, samples: 18420 },
    { id: "RES-002", title: "Tech Momentum Regime Study", status: "COMPLETED", updatedAt: "2026-10-05T18:20:00Z", score: 0.74, samples: 52310 },
    { id: "RES-003", title: "Pairs Cointegration Scan", status: "QUEUED", updatedAt: "2026-10-06T14:05:00Z", score: 0.69, samples: 8120 },
  ],
  strategies: [
    { id: "STR-001", name: "AAPL Mean Reversion", state: "LIVE", version: "1.8.2", returnPct: 12.42, sharpe: 1.88, allocationPct: 35 },
    { id: "STR-002", name: "NASDAQ Momentum", state: "PAPER", version: "0.9.4", returnPct: 7.16, sharpe: 1.31, allocationPct: 20 },
    { id: "STR-003", name: "Tech Pairs Alpha", state: "RESEARCH", version: "0.4.1", returnPct: 4.82, sharpe: 1.12, allocationPct: 10 },
  ],
  journal: [
    { id: "JRN-001", date: "2026-10-06", symbol: "AAPL", setup: "Mean reversion", bias: "LONG", rating: 4, pnl: 364.00, note: "Entry held above VWAP; risk stayed inside daily limit." },
    { id: "JRN-002", date: "2026-10-05", symbol: "MSFT", setup: "Momentum continuation", bias: "LONG", rating: 5, pnl: 281.40, note: "Clean trend day with controlled size." },
    { id: "JRN-003", date: "2026-10-03", symbol: "NVDA", setup: "Fade extension", bias: "SHORT", rating: 3, pnl: -74.25, note: "Exited after momentum persisted." },
  ],
  chart: { symbol: "AAPL", candles: [100.2,100.8,100.5,101.4,101.1,102.2,101.8,103.0,102.6,103.4,104.0,103.6,104.8], volume: [82,91,77,110,96,124,118,132,105,143,151,137,160] },
});

const server = createHttpApi(
  {
    application,
    workstationDemoData,
    authenticate: staticBearerAuthenticator(
      new Map([["dev-token", principal]]),
    ),
  },
  {
    corsOrigins: [
      "http://127.0.0.1:4173",
      "http://localhost:4173",
    ],
  },
);

const port = Number(process.env.API_PORT ?? 3000);
server.listen(port, "127.0.0.1", () => {
  console.log(`TradeLedger API: http://127.0.0.1:${port}`);
  console.log("Development bearer token: dev-token");
});
