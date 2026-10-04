import {
  AllowListedAuthorization,
  InMemoryOrderStateStore,
  InMemoryTradingContext,
  RandomOrderIdGenerator,
  TradingApplicationService,
} from "@tradeledger/application";
import { InMemoryMarketDataStateStore } from "@tradeledger/infrastructure";
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
  ]),
  new RandomOrderIdGenerator(),
  { now: () => new Date().toISOString() },
  undefined,
  undefined,
  undefined,
  marketData,
);

const server = createHttpApi(
  {
    application,
    authenticate: staticBearerAuthenticator(
      new Map([["dev-token", principal]]),
    ),
  },
  {
    corsOrigins: ["http://127.0.0.1:4173"],
  },
);

const port = Number(process.env.API_PORT ?? 3000);
server.listen(port, "127.0.0.1", () => {
  console.log(`TradeLedger API: http://127.0.0.1:${port}`);
  console.log("Development bearer token: dev-token");
});
