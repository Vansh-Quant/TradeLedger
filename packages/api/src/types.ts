import type { ApplicationPrincipal, TradingApplicationService } from "@tradeledger/application";
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";

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
  readonly authenticate: (request: ApiRequest) => Promise<ApplicationPrincipal>;
  readonly maxBodyBytes?: number;
  readonly rateLimit?: RateLimitPolicy;
}

export interface ApiServerOptions {
  readonly maxBodyBytes?: number;
  readonly rateLimit?: RateLimitPolicy;
}
