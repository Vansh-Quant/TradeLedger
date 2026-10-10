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

function buildServer(competition: CompetitionApplicationService, maxRequests = 200_000, maxBodyBytes = 1_048_576) {
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
      rateLimit: { windowMs: 60_000, maxRequests },
      maxBodyBytes,
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
  server.closeAllConnections();
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
      const responses: Response[] = [];
      const batchSize = 10;
      for (let offset = 0; offset < 1000; offset += batchSize) {
        const batch = await Promise.all(
          Array.from({ length: Math.min(batchSize, 1000 - offset) }, () =>
            fetch("http://127.0.0.1:" + port + "/api/v1/competition", { headers: authHeaders() }),
          ),
        );
        responses.push(...batch);
        const bodies = await Promise.all(batch.map((response) => response.json()));
        expect(bodies.every((body) => body.competition.state === "live")).toBe(true);
        expect(bodies.every((body) => body.competition.participants.length === 1000)).toBe(true);
      }
      const elapsedSeconds = (performance.now() - started) / 1000;
      expect(responses).toHaveLength(1000);
      expect(responses.every((response) => response.status === 200)).toBe(true);
      console.info("[competition-http-stress] snapshots", JSON.stringify({
        requests: 1000,
        elapsedSeconds: Number(elapsedSeconds.toFixed(3)),
        requestsPerSecond: Number((1000 / elapsedSeconds).toFixed(2)),
      }));
    } finally {
      await close(server);
    }
  });

  it("processes a 10,000-request concurrent authority burst without losing decisions", { timeout: 180_000 }, async () => {
    const competition = buildCompetition();
    const server = buildServer(competition);
    const { port } = await listen(server);
    try {
      const started = performance.now();
      const responses: Response[] = [];
      let allowed = 0;
      const batchSize = 20;
      for (let offset = 0; offset < 10_000; offset += batchSize) {
        const batch = await Promise.all(
          Array.from({ length: Math.min(batchSize, 10_000 - offset) }, (_, localIndex) => {
            const index = offset + localIndex;
            return fetch("http://127.0.0.1:" + port + "/api/v1/competition/authorize-order", {
              method: "POST",
              headers: { ...authHeaders(), "content-type": "application/json" },
              body: JSON.stringify({
                participantId: participantId(index % 1000),
                instrumentId: index % 3 === 0 ? "AAPL" : index % 3 === 1 ? "MSFT" : "NVDA",
                orderNotional: 1000,
                second: Math.floor(index / 5000),
              }),
            });
          }),
        );
        responses.push(...batch);
        const bodies: Array<{ decision?: { allowed?: boolean } }> = await Promise.all(batch.map((response) => response.json() as Promise<{ decision?: { allowed?: boolean } }>));
        expect(bodies.every((body) => body.decision?.allowed === true)).toBe(true);
        allowed += bodies.filter((body) => body.decision?.allowed === true).length;
      }
      const elapsedSeconds = (performance.now() - started) / 1000;
      expect(responses.every((response) => response.status === 200)).toBe(true);
      const snapshot = competition.get(principal);
      expect(snapshot.competition.participants).toHaveLength(1000);
      expect(snapshot.audit.filter((event) => event.action === "order_authorization")).toHaveLength(10_000);
      expect(competition.listEventsAfter(principal, 0)).toHaveLength(11_003);
      console.info("[competition-http-stress] authority", JSON.stringify({
        requests: 10_000,
        allowed,
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
      await Promise.allSettled(readerTasks);
      await close(server);
    }
  });
  it("fans out a live policy event to 1,000 real SSE connections", { timeout: 180_000 }, async () => {
    const competition = buildCompetition(1);
    const server = buildServer(competition);
    const { port } = await listen(server);
    const controllers = Array.from({ length: 1000 }, () => new AbortController());
    try {
      const readers: ReadableStreamDefaultReader<Uint8Array>[] = [];
      const batchSize = 25;
      for (let offset = 0; offset < controllers.length; offset += batchSize) {
        const batch = await Promise.all(
          controllers.slice(offset, offset + batchSize).map(async (controller) => {
            const response = await fetch(
              "http://127.0.0.1:" + port + "/api/v1/competition/events?after=0",
              { headers: { ...authHeaders(), accept: "text/event-stream" }, signal: controller.signal },
            );
            expect(response.status).toBe(200);
            return response.body!.getReader();
          }),
        );
        readers.push(...batch);
      }

      const decoder = new TextDecoder();
      const initial = await Promise.all(readers.map(async (reader) => {
        let text = "";
        for (let attempt = 0; attempt < 10 && !text.includes("competition.created"); attempt += 1) {
          const chunk = await reader.read();
          if (chunk.done) break;
          text += decoder.decode(chunk.value, { stream: true });
        }
        return text;
      }));
      expect(initial.every((text) => text.includes("competition.created"))).toBe(true);

      competition.updatePolicy({ principal, patch: { maxOrderNotional: 40_000 } });

      const delivered = await Promise.all(readers.map(async (reader) => {
        let text = "";
        for (let attempt = 0; attempt < 10 && !text.includes("competition.policy.updated"); attempt += 1) {
          const chunk = await reader.read();
          if (chunk.done) break;
          text += decoder.decode(chunk.value, { stream: true });
        }
        return text;
      }));
      expect(delivered.every((text) => text.includes("competition.policy.updated"))).toBe(true);

      console.info("[competition-http-stress] sse", JSON.stringify({
        subscribers: 1000,
        eventSequence: competition.listEventsAfter(principal, 0).at(-1)?.sequence ?? 0,
        delivered: delivered.filter((text) => text.includes("competition.policy.updated")).length,
      }));
    } finally {
      controllers.forEach((controller) => controller.abort());
      await close(server);
    }
  });

  it("reconnects with Last-Event-ID and replays only missing events", { timeout: 60_000 }, async () => {
    const competition = buildCompetition(1);
    const server = buildServer(competition);
    const { port } = await listen(server);
    const firstController = new AbortController();
    const secondController = new AbortController();
    try {
      const first = await fetch(
        "http://127.0.0.1:" + port + "/api/v1/competition/events?after=0",
        { headers: { ...authHeaders(), accept: "text/event-stream" }, signal: firstController.signal },
      );
      expect(first.status).toBe(200);
      const firstReader = first.body!.getReader();
      const decoder = new TextDecoder();
      let firstText = "";
      for (let attempt = 0; attempt < 10 && !firstText.includes("competition.created"); attempt += 1) {
        const chunk = await firstReader.read();
        if (chunk.done) break;
        firstText += decoder.decode(chunk.value, { stream: true });
      }
      expect(firstText).toContain("competition.created");

      const before = competition.listEventsAfter(principal, 0).at(-1)?.sequence ?? 0;
      firstController.abort();
      competition.updatePolicy({ principal, patch: { maxOrderNotional: 40_000 } });
      competition.updatePolicy({ principal, patch: { maxOrderNotional: 30_000 } });

      const replay = await fetch(
        "http://127.0.0.1:" + port + "/api/v1/competition/events",
        { headers: { ...authHeaders(), accept: "text/event-stream", "last-event-id": String(before) }, signal: secondController.signal },
      );
      expect(replay.status).toBe(200);
      const reader = replay.body!.getReader();
      let text = "";
      for (let attempt = 0; attempt < 10 && text.split("\n").filter((line) => line === "event: competition.policy.updated").length < 2; attempt += 1) {
        const chunk = await reader.read();
        if (chunk.done) break;
        text += decoder.decode(chunk.value, { stream: true });
      }
      const replayedEventLines = text.split("\n").filter((line) => line === "event: competition.policy.updated");
      expect(replayedEventLines).toHaveLength(2);
      expect(text).toContain(`id: ${before + 1}`);
      expect(text).toContain(`id: ${before + 2}`);
    } finally {
      firstController.abort();
      secondController.abort();
      await close(server);
    }
  });

  it("blocks a full post-halt HTTP burst and preserves the halted state", { timeout: 120_000 }, async () => {
    const competition = buildCompetition(1000);
    const server = buildServer(competition);
    const { port } = await listen(server);
    try {
      const before = competition.get(principal);
      const halt = await fetch("http://127.0.0.1:" + port + "/api/v1/competition/control", {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({
          action: "halt",
          expectedVersion: before.competition.version,
          requestId: "http-halt-stress",
        }),
      });
      expect(halt.status).toBe(200);

      const responses: Response[] = [];
      const batchSize = 20;
      const requestCount = 2_000;
      for (let offset = 0; offset < requestCount; offset += batchSize) {
        const batch = await Promise.all(
          Array.from({ length: batchSize }, (_, localIndex) => {
            const index = offset + localIndex;
            return fetch("http://127.0.0.1:" + port + "/api/v1/competition/authorize-order", {
              method: "POST",
              headers: { ...authHeaders(), "content-type": "application/json" },
              body: JSON.stringify({
                participantId: participantId(index % 1000),
                instrumentId: "AAPL",
                orderNotional: 1000,
                second: 2,
              }),
            });
          }),
        );
        responses.push(...batch);
        const bodies: Array<{ decision?: { allowed?: boolean; reason?: string } }> = await Promise.all(
          batch.map((response) => response.json() as Promise<{ decision?: { allowed?: boolean; reason?: string } }>),
        );
        expect(bodies.every((body) => body.decision?.allowed === false && body.decision.reason === "competition_not_live")).toBe(true);
      }

      expect(responses.every((response) => response.status === 200)).toBe(true);
      const after = competition.get(principal);
      expect(after.competition.state).toBe("halted");
      const decision = competition.authorizeOrder({
        principal,
        participantId: participantId(0),
        instrumentId: "AAPL",
        orderNotional: 1000,
        second: 2,
      });
      expect(decision.decision.allowed).toBe(false);
      expect(decision.decision.reason).toBe("competition_not_live");
    } finally {
      await close(server);
    }
  });

  it("enforces malformed-body, body-size, and rate-limit boundaries", { timeout: 30_000 }, async () => {
    const competition = buildCompetition(1);
    const server = buildServer(competition, 20);
    const { port } = await listen(server);
    try {
      const malformed = await fetch("http://127.0.0.1:" + port + "/api/v1/competition/authorize-order", {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: "{not-json",
      });
      expect(malformed.status).toBe(400);

      const wrongContentType = await fetch("http://127.0.0.1:" + port + "/api/v1/competition/authorize-order", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ participantId: "P-0000" }),
      });
      expect(wrongContentType.status).toBe(400);

      const oversized = await fetch("http://127.0.0.1:" + port + "/api/v1/competition/authorize-order", {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ payload: "x".repeat(300) }),
      });
      expect(oversized.status).toBe(400);

      const requests = await Promise.all(
        Array.from({ length: 50 }, () =>
          fetch("http://127.0.0.1:" + port + "/api/v1/competition", { headers: authHeaders() }),
        ),
      );
      expect(requests.some((response) => response.status === 429)).toBe(true);
      expect(requests.every((response) => [200, 429].includes(response.status))).toBe(true);
    } finally {
      await close(server);
    }
  });

  it("survives a combined HTTP + SSE competition assault with 1,000 participants", { timeout: 180_000 }, async () => {
    const competition = buildCompetition(1000);
    const server = buildServer(competition);
    const { port } = await listen(server);
    const controllers = Array.from({ length: 1000 }, () => new AbortController());
    const readers: ReadableStreamDefaultReader<Uint8Array>[] = [];
    const decoder = new TextDecoder();
    try {
      const connectionStarted = performance.now();
      const connectionBatchSize = 25;
      for (let offset = 0; offset < controllers.length; offset += connectionBatchSize) {
        const batch = await Promise.all(
          controllers.slice(offset, offset + connectionBatchSize).map(async (controller) => {
            const response = await fetch(
              "http://127.0.0.1:" + port + "/api/v1/competition/events?after=0",
              { headers: { ...authHeaders(), accept: "text/event-stream" }, signal: controller.signal },
            );
            expect(response.status).toBe(200);
            return response.body!.getReader();
          }),
        );
        readers.push(...batch);
      }

      const initial = await Promise.all(readers.map(async (reader) => {
        let text = "";
        for (let attempt = 0; attempt < 10 && !text.includes("competition.created"); attempt += 1) {
          const chunk = await reader.read();
          if (chunk.done) break;
          text += decoder.decode(chunk.value, { stream: true });
        }
        return text;
      }));
      expect(initial.every((text) => text.includes("competition.created"))).toBe(true);

      const authorityStarted = performance.now();
      let allowed = 0;
      const requestCount = 2_000;
      const requestBatchSize = 20;

      const deliveredParticipants = new Set<number>();
      let resolveDelivered!: (count: number) => void;
      let rejectDelivered!: (error: Error) => void;
      const deliveredPromise = new Promise<number>((resolve, reject) => {
        resolveDelivered = resolve;
        rejectDelivered = reject;
      });
      // Attach a rejection handler immediately while the HTTP burst is still running.
      const deliveredOutcomePromise = deliveredPromise.then(
        (count) => ({ count }),
        (error: unknown) => ({ error: error instanceof Error ? error : new Error(String(error)) }),
      );
      const readerErrors: Error[] = [];
      const readerTasks = readers.map(async (reader, readerIndex) => {
        let pending = "";
        try {
          // Keep draining every SSE stream for the whole HTTP burst. Returning as soon
          // as the policy event arrives leaves subsequent events unread per client,
          // fills socket buffers, and turns the test into a slow-consumer disconnect test.
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) return;
            pending += decoder.decode(chunk.value, { stream: true });
            let boundary = pending.indexOf("\n\n");
            while (boundary >= 0) {
              const frame = pending.slice(0, boundary);
              pending = pending.slice(boundary + 2);
              if (frame.includes("event: competition.policy.updated") && !deliveredParticipants.has(readerIndex)) {
                deliveredParticipants.add(readerIndex);
                if (deliveredParticipants.size === readers.length) resolveDelivered(deliveredParticipants.size);
              }
              boundary = pending.indexOf("\n\n");
            }
          }
        } catch (error) {
          if (!controllers[readerIndex]!.signal.aborted) {
            const normalized = error instanceof Error ? error : new Error(String(error));
            readerErrors.push(normalized);
            rejectDelivered(normalized);
          }
        }
      });

      competition.updatePolicy({ principal, patch: { maxOrderNotional: 40_000 } });

      for (let offset = 0; offset < requestCount; offset += requestBatchSize) {
        const batch = await Promise.all(
          Array.from({ length: Math.min(requestBatchSize, requestCount - offset) }, (_, localIndex) => {
            const index = offset + localIndex;
            return fetch("http://127.0.0.1:" + port + "/api/v1/competition/authorize-order", {
              method: "POST",
              headers: { ...authHeaders(), "content-type": "application/json" },
              body: JSON.stringify({
                participantId: participantId(index % 1000),
                instrumentId: index % 3 === 0 ? "AAPL" : index % 3 === 1 ? "MSFT" : "NVDA",
                orderNotional: 1000,
                second: Math.floor(index / 1000),
              }),
            });
          }),
        );
        const bodies: Array<{ decision?: { allowed?: boolean } }> = await Promise.all(
          batch.map((response) => response.json() as Promise<{ decision?: { allowed?: boolean } }>),
        );
        allowed += bodies.filter((body) => body.decision?.allowed === true).length;
      }

      const deliveryOutcome = await deliveredOutcomePromise;
      if ("error" in deliveryOutcome) throw deliveryOutcome.error;
      const deliveredCount = deliveryOutcome.count;
      expect(readerErrors).toEqual([]);
      expect(deliveredCount).toBe(1000);

      const authorityElapsed = (performance.now() - authorityStarted) / 1000;
      const connectionElapsed = (performance.now() - connectionStarted) / 1000;
      const snapshot = competition.get(principal);
      expect(allowed).toBe(requestCount);
      expect(snapshot.competition.state).toBe("live");
      expect(snapshot.competition.participants).toHaveLength(1000);
      expect(snapshot.policy.maxOrderNotional).toBe(40_000);
      expect(snapshot.audit.filter((event) => event.action === "order_authorization")).toHaveLength(requestCount);
      expect(deliveredCount).toBe(1000);

      console.info("[competition-http-stress] combined", JSON.stringify({
        participants: 1000,
        sseSubscribers: 1000,
        authorityRequests: requestCount,
        allowed,
        connectionSeconds: Number(connectionElapsed.toFixed(3)),
        authoritySeconds: Number(authorityElapsed.toFixed(3)),
        authorityRequestsPerSecond: Number((requestCount / authorityElapsed).toFixed(2)),
        liveEventDeliveries: deliveredCount,
      }));
    } finally {
      controllers.forEach((controller) => controller.abort());
      await close(server);
    }
  });

});
