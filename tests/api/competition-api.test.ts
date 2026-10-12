import { describe, expect, it } from "vitest";
import {
  AllowListedAuthorization,
  InMemoryOrderStateStore,
  InMemoryTradingContext,
  TradingApplicationService,
  RandomOrderIdGenerator,
  fixedClock,
  type ApplicationPrincipal,
  type TradingContext,
  CompetitionApplicationService,
} from "../../packages/application/src/index.js";
import { InMemoryMarketDataStateStore } from "../../core/infrastructure/src/index.js";
import { createHttpApi, staticBearerAuthenticator } from "../../packages/api/src/index.js";
import { createAccount, createAccountPortfolio, createBuyingPower, createPortfolio, createRiskLimits } from "../../core/domain/src/index.js";

const principal: ApplicationPrincipal = { id: "competition-api-user", roles: ["owner"] };
const account = createAccount({ id: "ACC-COMP", baseCurrency: "USD" });
const context: TradingContext = {
  accountId: account.id,
  accountPortfolio: createAccountPortfolio(account, createPortfolio()),
  buyingPower: createBuyingPower(100_000),
  riskLimits: createRiskLimits({ maxOrderNotional: 50_000, maxPositionNotional: 100_000, maxGrossExposure: 200_000, maxNetExposure: 150_000, maxDailyLoss: 5_000 }),
};

function createCompetition(): CompetitionApplicationService {
  const service = new CompetitionApplicationService();
  service.create({
    principal,
    config: {
      id: "CMP-API",
      name: "API Competition",
      maxParticipants: 1000,
      allowedInstruments: ["AAPL"],
      maxOrderNotional: 50_000,
      maxOrdersPerParticipantPerSecond: 10,
      startingEquity: 100_000,
    },
  });
  service.register({ principal, participantId: "P-0001", accountId: "CMP-0001" });
  const prepared = service.prepare(principal, "prepare-api");
  service.control({ principal, action: "start", expectedVersion: prepared.competition.version, requestId: "start-api" });
  return service;
}

function createServer() {
  const application = new TradingApplicationService(
    new InMemoryTradingContext([context]),
    new InMemoryOrderStateStore(),
    new AllowListedAuthorization(["competition-api-user:event-stream.read:ACC-COMP"]),
    new RandomOrderIdGenerator(),
    fixedClock("2026-10-08T12:00:00Z"),
    undefined,
    undefined,
    undefined,
    new InMemoryMarketDataStateStore(),
  );
  const competition = createCompetition();
  return { server: createHttpApi({
    application,
    competition,
    authenticate: staticBearerAuthenticator(new Map([["competition-token", principal]])),
  }), competition };
}

describe("competition HTTP realtime boundary", () => {
  it("serves the authoritative competition snapshot", async () => {
    const { server } = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("server did not bind");
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/competition`, { headers: { authorization: "Bearer competition-token" } });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.competition.state).toBe("live");
      expect(body.competition.participants).toHaveLength(1);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("returns only the authority decision instead of the full competition engine snapshot", async () => {
    const { server } = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("server did not bind");
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/competition/authorize-order`, {
        method: "POST",
        headers: { authorization: "Bearer competition-token", "content-type": "application/json" },
        body: JSON.stringify({
          participantId: "P-0001",
          instrumentId: "AAPL",
          orderNotional: 1000,
          second: 1,
        }),
      });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.decision.allowed).toBe(true);
      expect(body.decision.reason).toBe("allowed");
      expect(body.state).toBeUndefined();
      expect(JSON.stringify(body).length).toBeLessThan(1000);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("streams competition events and supports sequence replay", async () => {
    const { server, competition } = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("server did not bind");
    const controller = new AbortController();
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/competition/events?after=0`, {
        headers: { authorization: "Bearer competition-token", accept: "text/event-stream" },
        signal: controller.signal,
      });
      expect(response.status).toBe(200);
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (buffer.includes("competition.created")) break;
      }
      expect(buffer).toContain("competition.created");
      expect(competition.listEventsAfter(principal, 0).length).toBeGreaterThanOrEqual(4);
    } finally {
      controller.abort();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
