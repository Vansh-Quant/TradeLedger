import { generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import { AuthorizationError, AuthenticationError } from "../../packages/application/src/index.js";
import {
  AccountScopedAuthorization,
} from "../../packages/api/src/authorization.js";
import {
  supabaseJwtAuthenticator,
} from "../../packages/api/src/auth.js";
import {
  ConfigurationError,
  loadApiConfig,
} from "../../packages/api/src/config.js";
import { createLogger } from "../../packages/api/src/logging.js";
import { createHttpApi, type ApiRequest } from "../../packages/api/src/index.js";
import {
  AllowListedAuthorization,
  InMemoryOrderStateStore,
  InMemoryTradingContext,
  TradingApplicationService,
  fixedClock,
  fixedOrderIdGenerator,
} from "../../packages/application/src/index.js";
import { createAccount, createAccountPortfolio, createBuyingPower, createPortfolio, createRiskLimits } from "../../core/domain/src/index.js";
import { InMemoryMarketDataStateStore } from "../../core/infrastructure/src/index.js";

// ---------------------------------------------------------------- config

describe("API configuration validation", () => {
  it("fails production startup when authentication, host or CORS are missing", () => {
    expect.assertions(3);
    try {
      loadApiConfig({ NODE_ENV: "production" });
      throw new Error("expected configuration to be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      const problems = (error as ConfigurationError).problems.join(" ");
      expect(problems).toContain("SUPABASE_URL is required in production");
      expect(problems).toContain("CORS_ORIGINS");
    }
  });

  it("accepts a complete production configuration with Supabase JWT auth", () => {
    const config = loadApiConfig({
      NODE_ENV: "production",
      API_HOST: "0.0.0.0",
      CORS_ORIGINS: "https://app.example.com",
      SUPABASE_URL: "https://abc.supabase.co",
    });
    expect(config.environment).toBe("production");
    expect(config.authMode).toBe("supabase");
    expect(config.corsOrigins).toEqual(["https://app.example.com"]);
    expect(config.supabaseJwtAudience).toBe("authenticated");
  });

  it("keeps development defaults on loopback with the static token mode", () => {
    const config = loadApiConfig({});
    expect(config.environment).toBe("development");
    expect(config.authMode).toBe("static");
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(3000);
    expect(config.corsOrigins.length).toBeGreaterThan(0);
  });

  it("rejects wildcard or path-bearing CORS origins", () => {
    expect(() => loadApiConfig({ CORS_ORIGINS: "*" })).toThrow(ConfigurationError);
    expect(() => loadApiConfig({ CORS_ORIGINS: "https://*.example.com" })).toThrow(ConfigurationError);
    expect(() => loadApiConfig({ CORS_ORIGINS: "https://app.example.com/path" })).toThrow(ConfigurationError);
  });

  it("rejects malformed ports, body limits and rate-limit settings", () => {
    expect(() => loadApiConfig({ API_PORT: "70000" })).toThrow(ConfigurationError);
    expect(() => loadApiConfig({ API_MAX_BODY_BYTES: "0" })).toThrow(ConfigurationError);
    expect(() => loadApiConfig({ RATE_LIMIT_MAX_REQUESTS: "0" })).toThrow(ConfigurationError);
  });
});

// ---------------------------------------------------------------- JWT auth

const SUPABASE_URL = "https://test-project.supabase.co";
const ISSUER = `${SUPABASE_URL}/auth/v1`;

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicJwk = { ...publicKey.export({ format: "jwk" }), kid: "test-key-1", alg: "RS256", use: "sig" };

function b64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function makeToken(
  payload: Record<string, unknown>,
  options: { readonly tamper?: boolean; readonly kid?: string; readonly alg?: string } = {},
): string {
  const header = b64url(JSON.stringify({ alg: options.alg ?? "RS256", typ: "JWT", kid: options.kid ?? "test-key-1" }));
  const body = b64url(JSON.stringify(payload));
  const signature = cryptoSign("RSA-SHA256", Buffer.from(`${header}.${body}`), privateKey).toString("base64url");
  const signed = options.tamper
    ? `${header}.${b64url(JSON.stringify({ ...payload, sub: "attacker" }))}.${signature}`
    : `${header}.${body}.${signature}`;
  return signed;
}

function requestWithToken(token: string | undefined): ApiRequest {
  return {
    method: "GET",
    url: "/api/v1/orders",
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
    raw: {} as IncomingMessage,
  };
}

function authenticator(nowMs = 1_700_000_000_000) {
  return supabaseJwtAuthenticator({
    supabaseUrl: SUPABASE_URL,
    fetchJwks: async () => ({ keys: [publicJwk] }),
    now: () => nowMs,
  });
}

describe("Supabase JWT authentication", () => {
  const baseClaims = {
    sub: "user-uuid-123",
    iss: ISSUER,
    aud: "authenticated",
    exp: 1_700_000_060,
    iat: 1_700_000_000,
    nbf: 1_700_000_000,
  };

  it("accepts a valid token and derives identity from the sub claim", async () => {
    const principal = await authenticator()(requestWithToken(makeToken({ ...baseClaims, roles: ["trader"] })));
    expect(principal.id).toBe("user-uuid-123");
    expect(principal.roles).toEqual(["trader"]);
  });

  it("defaults roles when the token carries none", async () => {
    const principal = await authenticator()(requestWithToken(makeToken(baseClaims)));
    expect(principal.roles).toEqual(["authenticated"]);
  });

  it("rejects an expired token", async () => {
    const authenticate = authenticator(1_700_000_120_000);
    await expect(authenticate(requestWithToken(makeToken(baseClaims)))).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("rejects a token whose payload was swapped after signing", async () => {
    await expect(authenticator()(requestWithToken(makeToken(baseClaims, { tamper: true }))))
      .rejects.toBeInstanceOf(AuthenticationError);
  });

  it("rejects a wrong issuer", async () => {
    await expect(authenticator()(requestWithToken(makeToken({ ...baseClaims, iss: "https://evil.example.com" }))))
      .rejects.toBeInstanceOf(AuthenticationError);
  });

  it("rejects a wrong audience", async () => {
    await expect(authenticator()(requestWithToken(makeToken({ ...baseClaims, aud: "other-api" }))))
      .rejects.toBeInstanceOf(AuthenticationError);
  });

  it("rejects unknown key ids and unsupported algorithms", async () => {
    await expect(authenticator()(requestWithToken(makeToken(baseClaims, { kid: "unknown" }))))
      .rejects.toBeInstanceOf(AuthenticationError);
    await expect(authenticator()(requestWithToken(makeToken(baseClaims, { alg: "none" }))))
      .rejects.toBeInstanceOf(AuthenticationError);
  });

  it("rejects missing, malformed and non-bearer credentials", async () => {
    const authenticate = authenticator();
    await expect(authenticate(requestWithToken(undefined))).rejects.toBeInstanceOf(AuthenticationError);
    await expect(authenticate(requestWithToken("not-a-jwt"))).rejects.toBeInstanceOf(AuthenticationError);
    await expect(authenticate({ ...requestWithToken("a.b.c"), headers: { authorization: "Basic dXNlcjpwdw==" } }))
      .rejects.toBeInstanceOf(AuthenticationError);
  });
});

// ---------------------------------------------------------------- authorization

const ACCOUNT = "ACC-APP" as import("../../core/domain/src/index.js").AccountId;

describe("Account-scoped authorization", () => {
  const policy = new AccountScopedAuthorization({ accountIds: ["ACC-APP"] });

  it("allows a trader on the configured account", () => {
    expect(() => policy.authorize({ id: "u1", roles: ["trader"] }, "order.submit", ACCOUNT)).not.toThrow();
  });

  it("rejects a client-supplied foreign account id", () => {
    expect(() => policy.authorize({ id: "u1", roles: ["trader"] }, "order.submit", "ACC-VICTIM" as typeof ACCOUNT))
      .toThrow(AuthorizationError);
  });

  it("restricts viewer principals to read actions", () => {
    const viewer = { id: "u2", roles: ["viewer"] };
    expect(() => policy.authorize(viewer, "market-data.read", ACCOUNT)).not.toThrow();
    expect(() => policy.authorize(viewer, "order.submit", ACCOUNT)).toThrow(AuthorizationError);
    expect(() => policy.authorize(viewer, "research.run", ACCOUNT)).toThrow(AuthorizationError);
  });

  it("keeps the legacy allow-list behavior for existing routes", () => {
    const allowList = new AllowListedAuthorization(["u1:order.submit:ACC-APP"]);
    expect(() => allowList.authorize({ id: "u1", roles: ["trader"] }, "order.submit", ACCOUNT)).not.toThrow();
    expect(() => allowList.authorize({ id: "u2", roles: ["trader"] }, "order.submit", ACCOUNT)).toThrow(AuthorizationError);
  });
});

// ---------------------------------------------------------------- logging

describe("Structured logging", () => {
  it("emits one JSON line per event with level filtering", () => {
    const lines: string[] = [];
    const logger = createLogger({ level: "info", write: (line) => lines.push(line), now: () => new Date("2026-01-01T00:00:00Z") });
    logger.debug("ignored");
    logger.info("api.started", { environment: "development" });
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]!);
    expect(entry.event).toBe("api.started");
    expect(entry.level).toBe("info");
    expect(entry.ts).toBe("2026-01-01T00:00:00.000Z");
  });

  it("redacts secret-shaped values without dropping the event", () => {
    const lines: string[] = [];
    const logger = createLogger({ level: "debug", write: (line) => lines.push(line) });
    logger.warn("secret.check", {
      token: "super-secret-value",
      authorization: "Bearer abc",
      nested: { serviceRoleKey: "sk-test", password: "hunter2" },
      safe: "visible",
    });
    const entry = JSON.parse(lines[0]!);
    expect(entry.token).toBe("[redacted]");
    expect(entry.authorization).toBe("[redacted]");
    expect(entry.nested.serviceRoleKey).toBe("[redacted]");
    expect(entry.nested.password).toBe("[redacted]");
    expect(entry.safe).toBe("visible");
  });
});

// ------------------------------------------------- HTTP error contract

function testApplication() {
  const account = createAccount({ id: "ACC-API", baseCurrency: "USD" });
  const context = {
    accountId: account.id,
    accountPortfolio: createAccountPortfolio(account, createPortfolio()),
    buyingPower: createBuyingPower(10_000),
    riskLimits: createRiskLimits({
      maxOrderNotional: 5_000, maxPositionNotional: 10_000, maxGrossExposure: 20_000,
      maxNetExposure: 15_000, maxDailyLoss: 1_000,
    }),
  };
  return new TradingApplicationService(
    new InMemoryTradingContext([context]),
    new InMemoryOrderStateStore(),
    new AllowListedAuthorization(["api-user:order.read:ACC-API"]),
    fixedOrderIdGenerator("ORD-1"),
    fixedClock("2026-10-03T12:00:00.000Z"),
    undefined,
    undefined,
    undefined,
    new InMemoryMarketDataStateStore(),
  );
}

describe("HTTP error responses", () => {
  it("correlates 401/404 responses with the x-request-id header", async () => {
    const server = createHttpApi({
      application: testApplication(),
      authenticate: async () => { throw new AuthenticationError(); },
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("no port");
    try {
      const unauthorized = await fetch(`http://127.0.0.1:${address.port}/api/v1/orders?accountId=ACC-API`, {
        headers: { authorization: "Bearer wrong" },
      });
      expect(unauthorized.status).toBe(401);
      const body = await unauthorized.json() as { error: { code: string; requestId: string } };
      expect(body.error.code).toBe("UNAUTHORIZED");
      expect(body.error.requestId).toBe(unauthorized.headers.get("x-request-id"));
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
