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
const competitionContexts = Array.from({ length: 8 }, (_, index) => {
  const participantAccount = createAccount({ id: `CMP-${String(index + 1).padStart(4, "0")}`, baseCurrency: "USD" });
  return {
    accountId: participantAccount.id,
    accountPortfolio: createAccountPortfolio(participantAccount, createPortfolio()),
    buyingPower: createBuyingPower(100_000),
    riskLimits: createRiskLimits({
      maxOrderNotional: 50_000,
      maxPositionNotional: 100_000,
      maxGrossExposure: 200_000,
      maxNetExposure: 150_000,
      maxDailyLoss: 5_000,
    }),
  };
});

const principal = { id: "dev-user", roles: ["trader", "owner"] };
const marketData = new InMemoryMarketDataStateStore();

const application = new TradingApplicationService(
  new InMemoryTradingContext([context, ...competitionContexts]),
  new InMemoryOrderStateStore(),
  new AllowListedAuthorization([
    "dev-user:order.read:ACC-APP",
    ...competitionContexts.flatMap((entry) => [
      `dev-user:order.read:${entry.accountId}`,
      `dev-user:order.submit:${entry.accountId}`,
      `dev-user:order.cancel:${entry.accountId}`,
      `dev-user:order.expire:${entry.accountId}`,
      `dev-user:market-data.read:${entry.accountId}`,
      `dev-user:execution.record:${entry.accountId}`,
      `dev-user:event-stream.read:${entry.accountId}`,
    ]),
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

try {
  competitionApplication.get(principal);
} catch {
  competitionApplication.create({
    principal,
    config: {
      id: "CMP-2026-01",
      name: "TradeLedger Quant Competition",
      maxParticipants: 1000,
      allowedInstruments: ["AAPL", "MSFT", "NVDA", "AMZN", "TSLA", "META", "GOOGL", "AMD"],
      maxOrderNotional: 50_000,
      maxOrdersPerParticipantPerSecond: 10,
      startingEquity: 100_000,
    },
  });

  for (let index = 1; index <= 8; index += 1) {
    const participantId = `P-${String(index).padStart(4, "0")}`;
    competitionApplication.register({
      principal,
      participantId,
      accountId: `CMP-${String(index).padStart(4, "0")}`,
    });
  }

  const prepared = competitionApplication.prepare(principal, "dev-competition-prepare");
  competitionApplication.control({
    principal,
    action: "start",
    expectedVersion: prepared.competition.version,
    requestId: "dev-competition-start",
  });
}

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
