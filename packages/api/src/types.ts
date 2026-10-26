import type { ApplicationPrincipal, TradingApplicationService, CompetitionApplicationService } from "@tradeledger/application";
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import type { MarketDataProvider, ResearchBacktestRun } from "@tradeledger/domain";

export interface ApiRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: IncomingHttpHeaders;
  readonly remoteAddress?: string;
  readonly raw: IncomingMessage;
}

export interface RateLimitPolicy {
  readonly windowMs: number;
  readonly maxRequests: number;
}

/** Persistence port for saved research runs (backtests). */
export interface ResearchRunStore {
  save(run: ResearchBacktestRun): void;
  list(): readonly ResearchBacktestRun[];
  get(runId: string): ResearchBacktestRun | undefined;
}

export interface ApiDependencies {
  readonly application: TradingApplicationService;
  /** Optional provider for authenticated historical candle retrieval. */
  readonly historicalMarketDataProvider?: MarketDataProvider;
  readonly authenticate: (request: ApiRequest) => Promise<ApplicationPrincipal>;
  readonly maxBodyBytes?: number;
  readonly rateLimit?: RateLimitPolicy;
  readonly competition?: CompetitionApplicationService;
  /** Live ingestion snapshot reported by `GET /api/v1/market-data/status`. */
  readonly marketDataIngestionStatus?: () => unknown;
  /** Saved research runs for the backtesting API. */
  readonly researchRuns?: ResearchRunStore;
}

export interface ApiServerOptions {
  readonly maxBodyBytes?: number;
  readonly rateLimit?: RateLimitPolicy;
  readonly corsOrigins?: readonly string[];
}
