import { describe, expect, it } from "vitest";
import {
  AllowListedAuthorization,
  CompetitionApplicationService,
  InMemoryOrderStateStore,
  InMemoryTradingContext,
  RandomOrderIdGenerator,
  TradingApplicationService,
  fixedClock,
  type ApplicationPrincipal,
  type TradingContext,
} from "../../packages/application/src/index.js";
import { createHttpApi, staticBearerAuthenticator } from "../../packages/api/src/index.js";
import { InMemoryMarketDataStateStore } from "../../core/infrastructure/src/index.js";
import {
  createAccount,
  createAccountPortfolio,
  createBuyingPower,
  createPortfolio,
  createRiskLimits,
} from "../../core/domain/src/index.js";
import { performance } from "node:perf_hooks";

const principal: ApplicationPrincipal = { id: "competition-http-stress", roles: ["owner"] };
const token = "competition-http-stress-token";
const participantId = (index: number) => "P-" + String(index).padStart(4, "0");

function buildCompetition(participants = 1000): CompetitionApplicationService {
  const service = new CompetitionApplicationService();
  service.create({
    principal,
    config: {
      id: "CMP-HTTP-STRESS",
      name: "HTTP Stress Competition",
      maxParticipants: 1000,
      allowedInstruments: ["AAPL", "MSFT", "NVDA"],
      maxOrderNotional: 50_000,
      maxOrdersPerParticipantPerSecond: 10,
      startingEquity: 100_000,
    },
  });
  for (let index = 0; index < participants; index += 1) {
    service.register({
      principal,
      participantId: participantId(index),
      accountId: "ACC-" + participantId(index),
    });
  }
  const prepared = service.prepare(principal, "http-stress-prepare");
  service.control({
    principal,
    action: "start",
    expectedVersion: prepared.competition.version,
    requestId: "http-stress-start",
  });
  return service;
}

function buildServer(competition: CompetitionApplicationService) {
  const account = createAccount({ id: "ACC-HTTP-STRESS", baseCurrency: "USD" });
  const context: TradingContext = {
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
  const application = new TradingApplicationService(
    new InMemoryTradingContext([context]),
    new InMemoryOrderStateStore(),
    new AllowListedAuthorization([
      "competition-http-stress:event-stream.read:ACC-HTTP-STRESS",
    ]),
    new RandomOrderIdGenerator(),
    fixedClock("2026-10-08T12:00:00Z"),
    undefined,
    undefined,
    undefined,
    new InMemoryMarketDataStateStore(),
  );
  return createHttpApi(
    {
      application,
      competition,
      authenticate: staticBearerAuthenticator(new Map([[token, principal]])),
    },
    {
      rateLimit: { windowMs: 60_000, maxRequests: 200_000 },
    },
  );
}

async function listen(server: ReturnType<typeof createHttpApi>): Promise<{ server: ReturnType<typeof createHttpApi>; port: number }> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("server did not bind");
  return { server, port: address.port };
}

async function close(server: ReturnType<typeof createHttpApi>): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function authHeaders(): Record<string, string> {
  return { authorization: "Bearer " + token };
}

describe("competition HTTP load profile", () => {
  it("serves 1,000 participant snapshots through the real HTTP boundary", { timeout: 60_000 }, async () => {
    const competition = buildCompetition();
    const server = buildServer(competition);
    const { port } = await listen(server);
    try {
      const started = performance.now();
      const responses = await Promise.all(
        Array.from({ length: 1000 }, () =>
          fetch("http://127.0.0.1:" + port + "/api/v1/competition", { headers: authHeaders() }),
        ),
      );
      const elapsedSeconds = (performance.now() - started) / 1000;
      expect(responses.every((response) => response.status === 200)).toBe(true);
      const bodies = await Promise.all(responses.map((response) => response.json()));
      expect(bodies.every((body) => body.competition.state === "live")).toBe(true);
      expect(bodies.every((body) => body.competition.participants.length === 1000)).toBe(true);
      console.info("[competition-http-stress] snapshots", JSON.stringify({
        requests: 1000,
        elapsedSeconds: Number(elapsedSeconds.toFixed(3)),
        requestsPerSecond: Number((1000 / elapsedSeconds).toFixed(2)),
      }));
    } finally {
      await close(server);
    }
  });

  it("processes a 10,000-request concurrent authority burst without losing decisions", { timeout: 90_000 }, async () => {
    const competition = buildCompetition();
    const server = buildServer(competition);
    const { port } = await listen(server);
    try {
      const started = performance.now();
      const responses = await Promise.all(
        Array.from({ length: 10_000 }, (_, index) =>
          fetch("http://127.0.0.1:" + port + "/api/v1/competition/authorize-order", {
            method: "POST",
            headers: { ...authHeaders(), "content-type": "application/json" },
            body: JSON.stringify({
              participantId: participantId(index % 1000),
              instrumentId: index % 3 === 0 ? "AAPL" : index % 3 === 1 ? "MSFT" : "NVDA",
              orderNotional: 1000,
              second: Math.floor(index / 5000),
            }),
          }),
        ),
      );
      const elapsedSeconds = (performance.now() - started) / 1000;
      expect(responses.every((response) => response.status === 200)).toBe(true);
      const bodies = await Promise.all(responses.map((response) => response.json()));
      expect(bodies.every((body) => body.decision?.allowed === true)).toBe(true);
      const snapshot = competition.get(principal);
      expect(snapshot.competition.participants).toHaveLength(1000);
      expect(snapshot.audit.filter((event) => event.action === "order_authorization")).toHaveLength(10_000);
      expect(competition.listEventsAfter(principal, 0)).toHaveLength(11_003);
      console.info("[competition-http-stress] authority", JSON.stringify({
        requests: 10_000,
        allowed: bodies.filter((body) => body.decision?.allowed === true).length,
        elapsedSeconds: Number(elapsedSeconds.toFixed(3)),
        requestsPerSecond: Number((10_000 / elapsedSeconds).toFixed(2)),
      }));
    } finally {
      await close(server);
    }
  });

  it("rejects unauthorized and cross-origin requests without reaching competition state", { timeout: 30_000 }, async () => {
    const competition = buildCompetition(1);
    const server = buildServer(competition);
    const { port } = await listen(server);
    try {
      const before = competition.get(principal);
      const unauthorized = await fetch("http://127.0.0.1:" + port + "/api/v1/competition");
      expect(unauthorized.status).toBe(401);
      const crossOrigin = await fetch("http://127.0.0.1:" + port + "/api/v1/competition", {
        headers: { origin: "https://evil.example", ...authHeaders() },
      });
      expect(crossOrigin.status).toBe(403);
      const after = competition.get(principal);
      expect(after.competition.version).toBe(before.competition.version);
      expect(after.audit.length).toBe(before.audit.length);
      expect(after.leaderboard.length).toBe(1);
    } finally {
      await close(server);
    }
  });

  it("delivers live SSE events to 100 concurrent HTTP subscribers", { timeout: 60_000 }, async () => {
    const competition = buildCompetition(1);
    const server = buildServer(competition);
    const { port } = await listen(server);
    const controllers = Array.from({ length: 100 }, () => new AbortController());
    try {
      const readers = await Promise.all(
        controllers.map(async (controller) => {
          const response = await fetch(
            "http://127.0.0.1:" + port + "/api/v1/competition/events?after=0",
            { headers: { ...authHeaders(), accept: "text/event-stream" }, signal: controller.signal },
          );
          expect(response.status).toBe(200);
          return response.body!.getReader();
        }),
      );

      const decoder = new TextDecoder();
      const initialReads = await Promise.all(readers.map(async (reader) => {
        let text = "";
        for (let attempt = 0; attempt < 10 && !text.includes("competition.created"); attempt += 1) {
          const chunk = await reader.read();
          if (chunk.done) break;
          text += decoder.decode(chunk.value, { stream: true });
        }
        return text;
      }));
      expect(initialReads.every((chunk) => chunk.includes("competition.created"))).toBe(true);

      competition.updatePolicy({ principal, patch: { maxOrderNotional: 40_000 } });
      const eventChunks = await Promise.all(readers.map(async (reader) => {
        let text = "";
        for (let attempt = 0; attempt < 10 && !text.includes("competition.policy.updated"); attempt += 1) {
          const chunk = await reader.read();
          if (chunk.done) break;
          text += decoder.decode(chunk.value, { stream: true });
        }
        return text;
      }));
      expect(eventChunks.every((chunk) => chunk.includes("competition.policy.updated"))).toBe(true);
    } finally {
      controllers.forEach((controller) => controller.abort());
      await close(server);
    }
  });
});
