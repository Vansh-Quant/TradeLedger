import {
  AllowListedAuthorization,
  InMemoryOrderStateStore,
  InMemoryTradingContext,
  RandomOrderIdGenerator,
  TradingApplicationService,
  CompetitionApplicationService,
} from "@tradeledger/application";
import { BiQuoteMarketDataProvider, InMemoryMarketDataStateStore } from "../../../core/infrastructure/src/index.js";
import {
  createAccount,
  createAccountPortfolio,
  createBuyingPower,
  createPortfolio,
  createRiskLimits,
} from "@tradeledger/domain";
import { createHttpApi, staticBearerAuthenticator } from "./index.js";
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
  new InMemoryOrderStateStore(),
  new AllowListedAuthorization([
    "dev-user:order.read:ACC-APP",
    "dev-user:order.submit:ACC-APP",
    "dev-user:order.cancel:ACC-APP",
    "dev-user:order.expire:ACC-APP",
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

const competitionPersistence = new DurableCompetitionPersistence(process.env.TRADELEDGER_DATA_DIR ?? ".tradeledger-data");
const competitionApplication = new CompetitionApplicationService(competitionPersistence, application);

// Development server does not seed synthetic competition participants or orders.
// Existing persisted competition state is left untouched.

const server = createHttpApi(
  {
    application,
    historicalMarketDataProvider: new BiQuoteMarketDataProvider({ interval: "1h", limit: 1000 }),
    competition: competitionApplication,
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
