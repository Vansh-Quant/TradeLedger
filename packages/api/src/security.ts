import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import type { ApplicationPrincipal } from "@tradeledger/application";
import { AuthenticationError } from "@tradeledger/application";
import type { ApiRequest, RateLimitPolicy } from "./types.js";

export const DEFAULT_MAX_BODY_BYTES = 32 * 1024;

export function bearerToken(headers: IncomingHttpHeaders): string | undefined {
  const value = headers.authorization;
  if (typeof value !== "string") return undefined;
  const match = /^Bearer ([A-Za-z0-9._~+\/-]+)$/.exec(value.trim());
  return match?.[1];
}

export function constantTimeTokenEquals(actual: string, expected: string): boolean {
  const a = createHash("sha256").update(actual, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export function staticBearerAuthenticator(
  tokens: ReadonlyMap<string, ApplicationPrincipal>,
): (request: ApiRequest) => Promise<ApplicationPrincipal> {
  return async (request) => {
    const token = bearerToken(request.headers);
    if (token === undefined) throw new AuthenticationError();
    for (const [expected, principal] of tokens) {
      if (constantTimeTokenEquals(token, expected)) return principal;
    }
    throw new AuthenticationError();
  };
}

export class FixedWindowRateLimiter {
  private readonly hits = new Map<string, { windowStartedAt: number; count: number }>();

  constructor(private readonly policy: RateLimitPolicy) {
    if (!Number.isInteger(policy.windowMs) || policy.windowMs <= 0 ||
        !Number.isInteger(policy.maxRequests) || policy.maxRequests <= 0) {
      throw new Error("invalid rate-limit policy");
    }
  }

  allow(key: string, now = Date.now()): boolean {
    const current = this.hits.get(key);
    if (current === undefined || now - current.windowStartedAt >= this.policy.windowMs) {
      this.hits.set(key, { windowStartedAt: now, count: 1 });
      return true;
    }
    if (current.count >= this.policy.maxRequests) return false;
    current.count += 1;
    return true;
  }
}
