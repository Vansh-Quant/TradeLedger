import {
  AllowListedAuthorization,
  InMemoryOrderStateStore,
  InMemoryTradingContext,
  RandomOrderIdGenerator,
  TradingApplicationService,
  CompetitionApplicationService,
} from "@tradeledger/application";
import {
  BiQuoteMarketDataProvider, BiQuotePollingIngestion, DurableJsonStore,
  InMemoryMarketDataStateStore, MarketDataStateStoreSink, PersistenceError,
} from "../../../core/infrastructure/src/index.js";
import {
  createAccount,
  createAccountPortfolio,
  createBuyingPower,
  createPortfolio,
  createRiskLimits,
  type InstrumentId,
  type ResearchBacktestRun,
} from "@tradeledger/domain";
import { createHttpApi, staticBearerAuthenticator } from "./index.js";
import type { ResearchRunStore } from "./types.js";
import { DurableCompetitionPersistence } from "../../../core/infrastructure/src/index.js";

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
const principal = { id: "dev-user", roles: ["trader", "owner"] };
const marketData = new InMemoryMarketDataStateStore();

const application = new TradingApplicationService(
  new InMemoryTradingContext([context]),
  new InMemoryOrderStateStore(),    new AllowListedAuthorization([
      "dev-user:order.read:ACC-APP",
      "dev-user:order.submit:ACC-APP",
      "dev-user:order.cancel:ACC-APP",
      "dev-user:order.expire:ACC-APP",
      "dev-user:market-data.read:ACC-APP",
      "dev-user:research.run:ACC-APP",
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

const dataDir = process.env.TRADELEDGER_DATA_DIR ?? ".tradeledger-data";
const competitionPersistence = new DurableCompetitionPersistence(dataDir);
const competitionApplication = new CompetitionApplicationService(competitionPersistence, application);

// Development server does not seed synthetic competition participants or orders.
// Existing persisted competition state is left untouched.

const provider = new BiQuoteMarketDataProvider({ interval: "1h", limit: 1000 });

// Live market-data ingestion: real BiQuote candles (and quotes where the venue
// publishes them) polled into the same state store the API reads. The default
// instrument list is limited to symbols verified against the provider; override
// with TRADELEDGER_MARKET_DATA_INSTRUMENTS (comma separated).
const configuredInstruments = (process.env.TRADELEDGER_MARKET_DATA_INSTRUMENTS ?? "XAUUSD,EURUSD,USDJPY,BTCUSD")
  .split(",")
  .map((value) => value.trim().toUpperCase())
  .filter((value) => value.length > 0);
const stateSink = new MarketDataStateStoreSink(marketData);
const ingestion = new BiQuotePollingIngestion({
  provider,
  sink: { accept: (point) => { stateSink.accept(point); } },
  instruments: (configuredInstruments.length > 0 ? configuredInstruments : ["XAUUSD"]).map((value) => value as InstrumentId),
});

// Saved research runs live in their own collection directory; the competition
// and journal data already on disk are never touched by it.
const researchStore = new DurableJsonStore<ResearchBacktestRun>(dataDir, "research-runs", {
  encode: (value) => value,
  decode: (value) => {
    const run = value as ResearchBacktestRun;
    if (typeof run !== "object" || run === null || typeof run.runId !== "string" ||
      typeof run.createdAt !== "string" || typeof run.accountId !== "string" || run.report === undefined) {
      throw new PersistenceError("research run payload is invalid");
    }
    return run;
  },
});
const researchRuns: ResearchRunStore = {
  save: (run) => researchStore.save(run.runId, run),
  list: () => researchStore.list(),
  get: (runId) => researchStore.get(runId),
};

const server = createHttpApi(
  {
    application,
    historicalMarketDataProvider: provider,
    competition: competitionApplication,
    researchRuns,
    marketDataIngestionStatus: () => ingestion.status(),
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
  ingestion.start();
  console.log(`Market-data polling started for: ${configuredInstruments.join(", ") || "XAUUSD"}`);
});

const shutdown = (): void => {
  ingestion.stop();
  server.close();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
