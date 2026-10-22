import type { ApplicationPrincipal, TradingApplicationService, CompetitionApplicationService } from "@tradeledger/application";
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import type { MarketDataProvider } from "@tradeledger/domain";

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

export interface ApiDependencies {
  readonly application: TradingApplicationService;
  /** Optional provider for authenticated historical candle retrieval. */
  readonly historicalMarketDataProvider?: MarketDataProvider;
  readonly authenticate: (request: ApiRequest) => Promise<ApplicationPrincipal>;
  readonly maxBodyBytes?: number;
  readonly rateLimit?: RateLimitPolicy;
  /** Development-only fixture data for exercising the complete workstation UI. */
  readonly workstationDemoData?: (accountId: string) => unknown;
  readonly competition?: CompetitionApplicationService;
}

export interface ApiServerOptions {
  readonly maxBodyBytes?: number;
  readonly rateLimit?: RateLimitPolicy;
  readonly corsOrigins?: readonly string[];
  /** Optional development-only workstation fixture provider. */
  readonly workstationDemoData?: (accountId: string) => unknown;
}
