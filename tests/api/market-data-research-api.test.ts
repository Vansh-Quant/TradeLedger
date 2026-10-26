import { describe, expect, it, vi } from "vitest";
import {
  AllowListedAuthorization, InMemoryOrderStateStore, InMemoryTradingContext,
  TradingApplicationService, fixedClock, fixedOrderIdGenerator,
  type ApplicationPrincipal, type TradingContext,
} from "../../packages/application/src/index.js";
import { InMemoryMarketDataStateStore } from "../../core/infrastructure/src/index.js";
import {
  createBar, createAccount, createAccountPortfolio, createBuyingPower,
  createPortfolio, createRiskLimits,
  type Bar, type InstrumentId, type IntervalHistoricalProvider, type MarketDataPoint, type MarketDataProvider,
  type ResearchBacktestRun,
} from "../../core/domain/src/index.js";
import { createHttpApi, staticBearerAuthenticator } from "../../packages/api/src/index.js";
import type { ApiDependencies, ResearchRunStore } from "../../packages/api/src/types.js";

const RESEARCHER: ApplicationPrincipal = { id: "research-user", roles: ["trader"] };
const OTHER: ApplicationPrincipal = { id: "other-user", roles: ["trader"] };
const VIEWER: ApplicationPrincipal = { id: "viewer-user", roles: ["viewer"] };
const OUTSIDER: ApplicationPrincipal = { id: "outsider-user", roles: ["viewer"] };

const GRANTS = [
  "research-user:market-data.read:ACC-RESEARCH",
  "research-user:research.run:ACC-RESEARCH",
  "other-user:research.run:ACC-OTHER",
  "other-user:market-data.read:ACC-OTHER",
  "viewer-user:market-data.read:ACC-RESEARCH",
  "outsider-user:order.read:ACC-RESEARCH",
];

function makeApplication(): TradingApplicationService {
  const account = createAccount({ id: "ACC-RESEARCH", baseCurrency: "USD" });
  const context: TradingContext = {
    accountId: account.id,
    accountPortfolio: createAccountPortfolio(account, createPortfolio()),
    buyingPower: createBuyingPower(10_000),
    riskLimits: createRiskLimits({
      maxOrderNotional: 5000, maxPositionNotional: 10_000, maxGrossExposure: 20_000,
      maxNetExposure: 15_000, maxDailyLoss: 1000,
    }),
  };
  return new TradingApplicationService(
    new InMemoryTradingContext([context]),
    new InMemoryOrderStateStore(),
    new AllowListedAuthorization(GRANTS),
    fixedOrderIdGenerator("ORD-API"),
    fixedClock("2026-10-25T12:00:00Z"),
    undefined, undefined, undefined, new InMemoryMarketDataStateStore(),
  );
}

type TestProvider = MarketDataProvider & IntervalHistoricalProvider;

function dailyBar(dayOffset: number, close: number): Bar {
  const start = new Date(Date.UTC(2026, 9, 1 + dayOffset)).toISOString();
  return createBar({
    instrumentId: "EURUSD" as InstrumentId, timeframeSeconds: 86_400,
    startAt: start, endAt: new Date(Date.parse(start) + 86_400_000).toISOString(),
    open: close - 0.5, high: close + 1, low: close - 1.5, close, volume: 0, source: "biquote",
  });
}

function makeProvider(options: { bars?: readonly Bar[] } = {}): TestProvider {
  const bars = options.bars ?? Array.from({ length: 40 }, (_, i) => dailyBar(i, 100 + i));
  const historicalWithInterval = vi.fn(async (_id: InstrumentId, _kind: string, _interval: string) =>
    [...bars] as readonly MarketDataPoint[]);
  const historical = vi.fn(async () => [...bars] as readonly MarketDataPoint[]);
  return {
    providerId: "biquote",
    capabilities: { quotes: false, trades: false, bars: true, historical: true },
    supportedIntervals: ["1m", "5m", "15m", "30m", "1h", "4h", "1d"],
    subscribe: async () => { throw new Error("streaming not supported"); },
    unsubscribe: async () => {},
    historical,
    historicalWithInterval,
    health: async () => ({ providerId: "biquote", healthy: true, checkedAt: "2026-10-25T12:00:00Z" }),
  };
}

function memoryRunStore(): ResearchRunStore & { readonly map: Map<string, ResearchBacktestRun> } {
  const map = new Map<string, ResearchBacktestRun>();
  return {
    map,
    save: (run) => { map.set(run.runId, run); },
    list: () => [...map.values()],
    get: (runId) => map.get(runId),
  };
}

async function withServer<T>(
  deps: { provider?: TestProvider; researchRuns?: ResearchRunStore; ingestionStatus?: () => unknown },
  fn: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const apiDeps: ApiDependencies = {
    application: makeApplication(),
    authenticate: staticBearerAuthenticator(new Map([
      ["t-research", RESEARCHER],
      ["t-other", OTHER],
      ["t-viewer", VIEWER],
      ["t-outsider", OUTSIDER],
    ])),
    ...(deps.provider === undefined ? {} : { historicalMarketDataProvider: deps.provider }),
    ...(deps.researchRuns === undefined ? {} : { researchRuns: deps.researchRuns }),
    ...(deps.ingestionStatus === undefined ? {} : { marketDataIngestionStatus: deps.ingestionStatus }),
  };
  const server = createHttpApi(apiDeps);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("server did not bind");
  try {
    return await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

describe("market-data interval history API", () => {
  it("serves an explicit interval with coverage metadata", async () => {
    const provider = makeProvider();
    await withServer({ provider }, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/v1/market-data/EURUSD/history?accountId=ACC-RESEARCH&interval=1d&startAt=2026-10-01T00%3A00%3A00Z&endAt=2026-11-01T00%3A00%3A00Z`,
        { headers: auth("t-research") },
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({
        instrumentId: "EURUSD",
        provider: "biquote",
        interval: "1d",
        sourceInterval: "1d",
        aggregated: false,
        coverage: { count: 40, returnedFrom: "2026-10-01T00:00:00.000Z" },
      });
      expect(provider.historicalWithInterval).toHaveBeenCalledWith("EURUSD", "bar", "1d", "2026-10-01T00:00:00.000Z", "2026-11-01T00:00:00.000Z");
      expect(provider.historical).not.toHaveBeenCalled();
    });
  });

  it("rejects unsupported intervals with the list of valid ones", async () => {
    const provider = makeProvider();
    await withServer({ provider }, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/v1/market-data/EURUSD/history?accountId=ACC-RESEARCH&interval=3m&startAt=2026-10-01T00%3A00%3A00Z&endAt=2026-11-01T00%3A00%3A00Z`,
        { headers: auth("t-research") },
      );
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toContain("valid intervals: 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w, 1M");
      expect(provider.historicalWithInterval).not.toHaveBeenCalled();
    });
  });

  it("aggregates daily bars into calendar weeks for the 1w interval", async () => {
    const provider = makeProvider({
      bars: Array.from({ length: 14 }, (_, i) => dailyBar(i, 100 + i)),
    });
    await withServer({ provider }, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/v1/market-data/EURUSD/history?accountId=ACC-RESEARCH&interval=1w&startAt=2026-10-01T00%3A00%3A00Z&endAt=2026-10-15T00%3A00%3A00Z`,
        { headers: auth("t-research") },
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      // Request aligned down to Monday 2026-09-28 before reading daily bars.
      expect(provider.historicalWithInterval).toHaveBeenCalledWith(
        "EURUSD", "bar", "1d", "2026-09-28T00:00:00.000Z", "2026-10-15T00:00:00.000Z",
      );
      expect(body).toMatchObject({ interval: "1w", sourceInterval: "1d", aggregated: true });
      expect(body.bars).toHaveLength(3);
      expect(body.bars[0]).toMatchObject({
        startAt: "2026-10-01T00:00:00.000Z", endAt: "2026-10-05T00:00:00.000Z", timeframeSeconds: 4 * 86_400,
      });
      expect(body.bars[1]).toMatchObject({
        startAt: "2026-10-05T00:00:00.000Z", endAt: "2026-10-12T00:00:00.000Z", timeframeSeconds: 7 * 86_400,
      });
      expect(body.coverage.count).toBe(3);
    });
  });

  it("requires account authorization before touching the provider", async () => {
    const provider = makeProvider();
    await withServer({ provider }, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/v1/market-data/EURUSD/history?accountId=ACC-RESEARCH&interval=1d&startAt=2026-10-01T00%3A00%3A00Z&endAt=2026-11-01T00%3A00%3A00Z`,
        { headers: auth("t-other") },
      );
      expect(response.status).toBe(403);
      expect(provider.historicalWithInterval).not.toHaveBeenCalled();
    });
  });
});

describe("instrument resolution API", () => {
  it("resolves a supported symbol against live provider data", async () => {
    const provider = makeProvider();
    await withServer({ provider }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/market-data/XAUUSD/resolve?accountId=ACC-RESEARCH`, { headers: auth("t-research") });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({ symbol: "XAUUSD", provider: "biquote", supported: true, interval: "1d" });
      expect(body.latestBar).toBeDefined();
      expect(body.latestBar.close).toBeGreaterThan(0);
      expect(provider.historicalWithInterval).toHaveBeenCalledWith(
        "XAUUSD", "bar", "1d",
        expect.any(String), expect.any(String),
      );
    });
  });

  it("reports an unsupported symbol honestly instead of inventing one", async () => {
    const provider = makeProvider({ bars: [] });
    await withServer({ provider }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/market-data/NAS100/resolve?accountId=ACC-RESEARCH`, { headers: auth("t-research") });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({ symbol: "NAS100", supported: false });
      expect(body.detail).toContain("no data for this symbol");
      expect(body.latestBar).toBeUndefined();
    });
  });

  it("rejects malformed symbols and unauthorized callers", async () => {
    const provider = makeProvider();
    await withServer({ provider }, async (baseUrl) => {
      const malformed = await fetch(`${baseUrl}/api/v1/market-data/bad%20symbol/resolve?accountId=ACC-RESEARCH`, { headers: auth("t-research") });
      expect(malformed.status).toBe(400);

      const forbidden = await fetch(`${baseUrl}/api/v1/market-data/XAUUSD/resolve?accountId=ACC-RESEARCH`, { headers: auth("t-outsider") });
      expect(forbidden.status).toBe(403);
      expect(provider.historicalWithInterval).not.toHaveBeenCalled();
    });
  });
});

describe("market-data status API", () => {
  it("reports provider health and ingestion state", async () => {
    const provider = makeProvider();
    await withServer({
      provider,
      ingestionStatus: () => ({ providerId: "biquote", polling: true, acceptedPoints: 4, instruments: ["XAUUSD"] }),
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/market-data/status?accountId=ACC-RESEARCH`, { headers: auth("t-research") });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.provider).toMatchObject({ providerId: "biquote", healthy: true });
      expect(body.ingestion).toMatchObject({ polling: true, acceptedPoints: 4 });
    });
  });

  it("requires authorization", async () => {
    const provider = makeProvider();
    await withServer({ provider }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/market-data/status?accountId=ACC-RESEARCH`, { headers: auth("t-outsider") });
      expect(response.status).toBe(403);
    });
  });
});

const backtestBody = (overrides: Record<string, unknown> = {}) => ({
  accountId: "ACC-RESEARCH",
  instrumentId: "EURUSD",
  interval: "1d",
  startAt: "2026-10-01T00:00:00.000Z",
  endAt: "2026-11-01T00:00:00.000Z",
  strategy: { kind: "sma_crossover", parameters: { fast: 2, slow: 5 } },
  initialCapital: 100_000,
  quantity: 1,
  commissionPerTrade: 1,
  slippageBps: 2,
  ...overrides,
});

describe("research backtest API", () => {
  it("runs a deterministic backtest over real provider bars", async () => {
    const provider = makeProvider();
    const store = memoryRunStore();
    await withServer({ provider, researchRuns: store }, async (baseUrl) => {
      const first = await fetch(`${baseUrl}/api/v1/research/backtests`, {
        method: "POST", headers: { ...auth("t-research"), "content-type": "application/json" },
        body: JSON.stringify(backtestBody()),
      });
      expect(first.status).toBe(201);
      const runA = await first.json();
      expect(runA).toMatchObject({
        accountId: "ACC-RESEARCH", instrumentId: "EURUSD", interval: "1d",
        assumptions: { initialCapital: 100_000, commissionPerTrade: 1, slippageBps: 2, execution: "next-bar-open" },
        dataRange: { count: 40, source: "biquote" },
        strategy: { kind: "sma_crossover", version: 1, parameters: { fast: 2, slow: 5 } },
      });
      expect(runA.equityCurve).toHaveLength(41);
      expect(runA.report.performance).toHaveProperty("maxDrawdownPct");
      expect(Array.isArray(runA.warnings)).toBe(true);

      const second = await fetch(`${baseUrl}/api/v1/research/backtests`, {
        method: "POST", headers: { ...auth("t-research"), "content-type": "application/json" },
        body: JSON.stringify(backtestBody()),
      });
      const runB = await second.json();
      // Identical inputs, identical results: only the identity fields differ.
      expect(runB.report).toEqual(runA.report);
      expect(runB.equityCurve).toEqual(runA.equityCurve);
      expect(runB.trades).toEqual(runA.trades);
      expect(runB.runId).not.toBe(runA.runId);
    });
  });

  it("persists saved runs and lists them for the owning account only", async () => {
    const provider = makeProvider();
    const store = memoryRunStore();
    await withServer({ provider, researchRuns: store }, async (baseUrl) => {
      const created = await fetch(`${baseUrl}/api/v1/research/backtests`, {
        method: "POST", headers: { ...auth("t-research"), "content-type": "application/json" },
        body: JSON.stringify(backtestBody({ save: true })),
      });
      const run = await created.json();

      const list = await fetch(`${baseUrl}/api/v1/research/backtests?accountId=ACC-RESEARCH`, { headers: auth("t-research") });
      expect(list.status).toBe(200);
      expect((await list.json()).runs).toHaveLength(1);

      const detail = await fetch(`${baseUrl}/api/v1/research/backtests/${run.runId}?accountId=ACC-RESEARCH`, { headers: auth("t-research") });
      expect(detail.status).toBe(200);
      expect((await detail.json()).runId).toBe(run.runId);

      // Another account's session can neither see nor read this run.
      const foreignList = await fetch(`${baseUrl}/api/v1/research/backtests?accountId=ACC-OTHER`, { headers: auth("t-other") });
      expect((await foreignList.json()).runs).toHaveLength(0);
      const foreignDetail = await fetch(`${baseUrl}/api/v1/research/backtests/${run.runId}?accountId=ACC-OTHER`, { headers: auth("t-other") });
      expect(foreignDetail.status).toBe(404);

      const missing = await fetch(`${baseUrl}/api/v1/research/backtests/run-nope?accountId=ACC-RESEARCH`, { headers: auth("t-research") });
      expect(missing.status).toBe(404);
    });
  });

  it("rejects invalid strategies, intervals, ranges and unauthorized callers", async () => {
    const provider = makeProvider();
    await withServer({ provider, researchRuns: memoryRunStore() }, async (baseUrl) => {
      const post = (body: unknown, token = "t-research") =>
        fetch(`${baseUrl}/api/v1/research/backtests`, {
          method: "POST", headers: { ...auth(token), "content-type": "application/json" },
          body: JSON.stringify(body),
        });

      const badKind = await post(backtestBody({ strategy: { kind: "while_true", parameters: {} } }));
      expect(badKind.status).toBe(400);
      expect((await badKind.json()).error.message).toContain("not supported");

      const badInterval = await post(backtestBody({ interval: "3m" }));
      expect(badInterval.status).toBe(400);
      expect((await badInterval.json()).error.message).toContain("valid intervals");

      const badRange = await post(backtestBody({ startAt: "2026-11-01T00:00:00.000Z", endAt: "2026-10-01T00:00:00.000Z" }));
      expect(badRange.status).toBe(400);

      const noPermission = await post(backtestBody(), "t-viewer");
      expect(noPermission.status).toBe(403);
    });
  });

  it("reports empty provider history instead of backtesting nothing", async () => {
    const provider = makeProvider({ bars: [] });
    await withServer({ provider, researchRuns: memoryRunStore() }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/research/backtests`, {
        method: "POST", headers: { ...auth("t-research"), "content-type": "application/json" },
        body: JSON.stringify(backtestBody()),
      });
      expect(response.status).toBe(400);
      expect((await response.json()).error.message).toContain("no historical bars");
    });
  });

  it("fails closed when research persistence is not configured", async () => {
    const provider = makeProvider();
    await withServer({ provider }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/research/backtests?accountId=ACC-RESEARCH`, { headers: auth("t-research") });
      expect(response.status).toBe(503);
      expect((await response.json()).error.code).toBe("RESEARCH_UNAVAILABLE");
    });
  });
});