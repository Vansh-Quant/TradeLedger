import { describe, expect, it } from "vitest";
import {
  AllowListedAuthorization,
  InMemoryOrderStateStore,
  InMemoryTradingContext,
  TradingApplicationService,
  fixedClock,
  fixedOrderIdGenerator,
  type ApplicationPrincipal,
  type TradingContext,
} from "../../packages/application/src/index.js";
import {
  createAccount,
  createAccountPortfolio,
  createBuyingPower,
  createPortfolio,
  createRiskLimits,
} from "../../core/domain/src/index.js";
import {
  createHttpApi,
  staticBearerAuthenticator,
} from "../../packages/api/src/index.js";

const principal: ApplicationPrincipal = { id: "api-user", roles: ["trader"] };
const account = createAccount({ id: "ACC-API", baseCurrency: "USD" });
const context: TradingContext = {
  accountId: account.id,
  accountPortfolio: createAccountPortfolio(account, createPortfolio()),
  buyingPower: createBuyingPower(10_000),
  riskLimits: createRiskLimits({
    maxOrderNotional: 5_000,
    maxPositionNotional: 10_000,
    maxGrossExposure: 20_000,
    maxNetExposure: 15_000,
    maxDailyLoss: 1_000,
  }),
};

function application() {
  return new TradingApplicationService(
    new InMemoryTradingContext([context]),
    new InMemoryOrderStateStore(),
    new AllowListedAuthorization([
      "api-user:order.submit:ACC-API",
      "api-user:order.read:ACC-API",
      "api-user:order.cancel:ACC-API",
    ]),
    fixedOrderIdGenerator("ORD-API-001"),
    fixedClock("2026-10-03T12:00:00.000Z"),
  );
}

function auth() {
  return staticBearerAuthenticator(new Map([["test-token", principal]]));
}

function orderBody(quantity = 10) {
  return JSON.stringify({
    accountId: "ACC-API",
    instrumentId: "AAPL",
    side: "buy",
    type: "limit",
    quantity,
    limitPrice: 100,
    timeInForce: "day",
    orderNotional: quantity * 100,
    projectedPositionNotional: quantity * 100,
    projectedGrossExposure: quantity * 100,
    projectedNetExposure: quantity * 100,
    dailyLoss: 0,
  });
}

async function withServer<T>(
  fn: (baseUrl: string) => Promise<T>,
  options?: Parameters<typeof createHttpApi>[1],
) {
  const server = createHttpApi(
    { application: application(), authenticate: auth() },
    options,
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("server did not bind");
  try {
    return await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe("HTTP API security boundary", () => {
  it("exposes minimal unauthenticated health state", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/health`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "ok" });
    });
  });

  it("uses the typed workstation client against the HTTP boundary", async () => {
    const { TradeLedgerApiClient } = await import("../../packages/api/src/client.js");
    await withServer(async (baseUrl) => {
      const client = new TradeLedgerApiClient({
        baseUrl,
        getToken: () => "test-token",
      });
      const result = await client.getTradingContext("ACC-API");
      expect(result.context.accountId).toBe("ACC-API");
    });
  });

  it("serves an authorized trading context to the workstation", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/accounts/ACC-API/context`, {
        headers: { authorization: "Bearer test-token" },
      });
      expect(response.status).toBe(200);
      expect((await response.json()).context.accountId).toBe("ACC-API");
    });
  });

  it("supports explicit CORS preflight for an allowed workstation origin", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/accounts/ACC-API/context`, {
        method: "OPTIONS",
        headers: { origin: "http://localhost:5173" },
      });
      expect(response.status).toBe(204);
      expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
      expect(response.headers.get("access-control-allow-methods")).toContain("POST");
    }, { corsOrigins: ["http://localhost:5173"] });
  });

  it("rejects an unapproved CORS origin", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/health`, {
        headers: { origin: "http://evil.example" },
      });
      expect(response.status).toBe(403);
    }, { corsOrigins: ["http://localhost:5173"] });
  });

  it("requires bearer authentication for trading routes", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/orders`);
      expect(response.status).toBe(401);
    });
  });

  it("creates an order through the application boundary", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/orders`, {
        method: "POST",
        headers: {
          authorization: "Bearer test-token",
          "content-type": "application/json",
          "idempotency-key": "create-1",
        },
        body: orderBody(),
      });
      expect(response.status).toBe(201);
      expect((await response.json()).admitted).toBe(true);
    });
  });

  it("requires idempotency keys for mutations", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/orders`, {
        method: "POST",
        headers: { authorization: "Bearer test-token", "content-type": "application/json" },
        body: orderBody(),
      });
      expect(response.status).toBe(400);
    });
  });

  it("rejects malformed idempotency keys", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/orders`, {
        method: "POST",
        headers: {
          authorization: "Bearer test-token",
          "content-type": "application/json",
          "idempotency-key": "bad key",
        },
        body: orderBody(),
      });
      expect(response.status).toBe(400);
    });
  });

  it("replays an identical mutation without executing it twice", async () => {
    await withServer(async (baseUrl) => {
      const headers = {
        authorization: "Bearer test-token",
        "content-type": "application/json",
        "idempotency-key": "replay-1",
      };
      const first = await fetch(`${baseUrl}/api/v1/orders`, { method: "POST", headers, body: orderBody() });
      const second = await fetch(`${baseUrl}/api/v1/orders`, { method: "POST", headers, body: orderBody() });
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(await second.json()).toEqual(await first.json());
    });
  });

  it("rejects idempotency-key reuse with a different payload", async () => {
    await withServer(async (baseUrl) => {
      const headers = {
        authorization: "Bearer test-token",
        "content-type": "application/json",
        "idempotency-key": "conflict-1",
      };
      expect((await fetch(`${baseUrl}/api/v1/orders`, { method: "POST", headers, body: orderBody() })).status).toBe(201);
      expect((await fetch(`${baseUrl}/api/v1/orders`, {
        method: "POST",
        headers,
        body: orderBody(11),
      })).status).toBe(409);
    });
  });

  it("does not leak authentication details for invalid tokens", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/orders`, {
        method: "POST",
        headers: {
          authorization: "Bearer wrong-token",
          "content-type": "application/json",
          "idempotency-key": "invalid-auth-1",
        },
        body: orderBody(),
      });
      expect(response.status).toBe(401);
    });
  });

  it("rejects non-JSON bodies before application execution", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/orders`, {
        method: "POST",
        headers: {
          authorization: "Bearer test-token",
          "content-type": "text/plain",
          "idempotency-key": "bad-content-type-1",
        },
        body: "not-json",
      });
      expect(response.status).toBe(400);
    });
  });

  it("rejects oversized request bodies", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/orders`, {
        method: "POST",
        headers: {
          authorization: "Bearer test-token",
          "content-type": "application/json",
          "idempotency-key": "oversized-1",
        },
        body: JSON.stringify({ data: "x".repeat(100) }),
      });
      expect(response.status).toBe(400);
    }, { maxBodyBytes: 32 });
  });

  it("returns restrictive security headers and an opaque request id", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/health`);
      expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    });
  });

  it("rate limits repeated requests", async () => {
    await withServer(async (baseUrl) => {
      expect((await fetch(`${baseUrl}/health`)).status).toBe(200);
      expect((await fetch(`${baseUrl}/health`)).status).toBe(200);
      expect((await fetch(`${baseUrl}/health`)).status).toBe(429);
    }, { rateLimit: { windowMs: 60_000, maxRequests: 2 } });
  });

  it("rejects JSON-looking content types that are not application/json", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/orders`, {
        method: "POST",
        headers: {
          authorization: "Bearer test-token",
          "content-type": "application/jsonish",
          "idempotency-key": "bad-json-type-1",
        },
        body: orderBody(),
      });
      expect(response.status).toBe(400);
    });
  });

  it("rejects malformed percent-encoded order ids without leaking parser errors", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/orders/%E0%A4%A?accountId=ACC-API`, {
        headers: { authorization: "Bearer test-token" },
      });
      expect(response.status).toBe(400);
    });
  });

  it("maps unexpected application failures without leaking internals", async () => {
    const server = createHttpApi({
      application: {
        submitOrder: () => { throw new Error("secret internal detail"); },
      } as never,
      authenticate: auth(),
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("server did not bind");
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/orders`, {
        method: "POST",
        headers: {
          authorization: "Bearer test-token",
          "content-type": "application/json",
          "idempotency-key": "internal-error-1",
        },
        body: orderBody(),
      });
      expect(response.status).toBe(500);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
