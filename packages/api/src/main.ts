import {
  InMemoryOrderStateStore,
  InMemoryTradingContext,
  RandomOrderIdGenerator,
  TradingApplicationService,
  CompetitionApplicationService,
  type ApplicationPrincipal,
} from "@tradeledger/application";
import {
  BiQuoteMarketDataProvider, BiQuotePollingIngestion, DurableJsonStore,
  InMemoryMarketDataStateStore, MarketDataStateStoreSink, PersistenceError,
  DurableCompetitionPersistence,
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
import { AccountScopedAuthorization } from "./authorization.js";
import { supabaseJwtAuthenticator } from "./auth.js";
import { ConfigurationError, loadApiConfig, type ApiConfig } from "./config.js";
import { createLogger, type Logger } from "./logging.js";
import type { ApiDependencies, ResearchRunStore } from "./types.js";
import type { Server } from "node:http";

/**
 * Config-driven API bootstrap shared by every entry point.
 *
 * - development/test: static bearer token (dev-token) + loopback defaults.
 * - production: Supabase JWT verification; refuses to boot without SUPABASE_URL
 *   and explicit CORS_ORIGINS, so the development token can never become a
 *   production credential.
 */
export interface StartedApi {
  readonly server: Server;
  readonly config: ApiConfig;
  readonly logger: Logger;
  readonly baseUrl: string;
  close(): Promise<void>;
}

const DEV_PRINCIPAL: ApplicationPrincipal = { id: "dev-user", roles: ["trader", "owner"] };
const DEV_TOKEN = "dev-token";

export function buildApiDependencies(config: ApiConfig, logger: Logger): { deps: ApiDependencies; stop: () => void } {
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
  const marketData = new InMemoryMarketDataStateStore();

  const accountIds = (process.env.TRADELEDGER_ACCOUNT_IDS ?? "ACC-APP")
    .split(",").map((value) => value.trim()).filter((value) => value.length > 0);

  const application = new TradingApplicationService(
    new InMemoryTradingContext([context]),
    new InMemoryOrderStateStore(),
    new AccountScopedAuthorization({ accountIds }),
    new RandomOrderIdGenerator(),
    { now: () => new Date().toISOString() },
    undefined,
    undefined,
    undefined,
    marketData,
  );

  const authenticate = config.authMode === "supabase"
    ? supabaseJwtAuthenticator({
        supabaseUrl: config.supabaseUrl!,
        audience: config.supabaseJwtAudience,
      })
    : staticBearerAuthenticator(new Map([[DEV_TOKEN, DEV_PRINCIPAL]]));

  const dataDir = config.dataDir;
  const competitionPersistence = new DurableCompetitionPersistence(dataDir);
  const competitionApplication = new CompetitionApplicationService(competitionPersistence, application);

  const provider = new BiQuoteMarketDataProvider({ interval: "1h", limit: 1000 });

  // Live market-data polling for provider-verified symbols only; override with
  // TRADELEDGER_MARKET_DATA_INSTRUMENTS (comma separated).
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

  const deps: ApiDependencies = {
    application,
    historicalMarketDataProvider: provider,
    competition: competitionApplication,
    researchRuns,
    marketDataIngestionStatus: () => ingestion.status(),
    authenticate,
  };

  return {
    deps,
    stop: () => {
      try { ingestion.stop(); } catch (error) {
        logger.warn("ingestion.shutdown_failed", { error: error instanceof Error ? error.message : String(error) });
      }
    },
  };
}

export function startTradeLedgerApi(env: NodeJS.ProcessEnv = process.env, overrides: Partial<ApiConfig> = {}): StartedApi {
  let config: ApiConfig;
  try {
    config = { ...loadApiConfig(env), ...overrides };
  } catch (error) {
    if (error instanceof ConfigurationError) {
      for (const problem of error.problems) console.error(`TradeLedger API configuration error: ${problem}`);
      console.error("TradeLedger API failed to start: fix the configuration above and retry.");
      process.exitCode = 1;
      throw error;
    }
    throw error;
  }

  const logger = createLogger({ level: config.logLevel, service: "tradeledger-api" });
  const { deps, stop } = buildApiDependencies(config, logger);

  const server = createHttpApi(deps, {
    corsOrigins: config.corsOrigins,
    rateLimit: config.rateLimit,
    maxBodyBytes: config.maxBodyBytes,
    logger,
  });

  const baseUrl = `http://${config.host}:${config.port}`;
  server.listen(config.port, config.host, () => {
    logger.info("api.started", {
      environment: config.environment,
      baseUrl,
      authMode: config.authMode,
      corsOrigins: config.corsOrigins.length,
      rateLimit: config.rateLimit,
    });
    if (config.authMode === "static") {
      logger.warn("api.dev_token_active", {
        message: "static development token authentication is active; it is disabled in production builds by config validation",
      });
    }
  });

  let closing = false;
  const close = async (): Promise<void> => {
    if (closing) return;
    closing = true;
    stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    logger.info("api.stopped", { baseUrl });
  };

  const shutdown = (signal: string): void => {
    logger.info("api.signal", { signal });
    void close().then(() => process.exit(0), () => process.exit(1));
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));

  return { server, config, logger, baseUrl, close };
}