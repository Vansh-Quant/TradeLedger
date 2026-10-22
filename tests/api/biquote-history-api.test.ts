import { describe, expect, it, vi } from "vitest";
import {
  AllowListedAuthorization, InMemoryOrderStateStore, InMemoryTradingContext,
  TradingApplicationService, fixedClock, fixedOrderIdGenerator,
  type ApplicationPrincipal, type TradingContext,
} from "../../packages/application/src/index.js";
import { InMemoryMarketDataStateStore } from "../../core/infrastructure/src/index.js";
import { createBar, createAccount, createAccountPortfolio, createBuyingPower, createPortfolio, createRiskLimits, type InstrumentId, type MarketDataProvider } from "../../core/domain/src/index.js";
import { createHttpApi, staticBearerAuthenticator } from "../../packages/api/src/index.js";

const principal: ApplicationPrincipal = { id: "market-user", roles: ["trader"] };
const account = createAccount({ id: "ACC-HISTORY", baseCurrency: "USD" });
const context: TradingContext = {
  accountId: account.id,
  accountPortfolio: createAccountPortfolio(account, createPortfolio()),
  buyingPower: createBuyingPower(10000),
  riskLimits: createRiskLimits({ maxOrderNotional: 5000, maxPositionNotional: 10000, maxGrossExposure: 20000, maxNetExposure: 15000, maxDailyLoss: 1000 }),
};
function makeApplication() {
  return new TradingApplicationService(
    new InMemoryTradingContext([context]), new InMemoryOrderStateStore(),
    new AllowListedAuthorization(["market-user:market-data.read:ACC-HISTORY"]),
    fixedOrderIdGenerator("ORD-HISTORY"), fixedClock("2026-10-01T12:00:00Z"),
    undefined, undefined, undefined, new InMemoryMarketDataStateStore(),
  );
}
function makeProvider() {
  const bar = createBar({
    instrumentId: "XAUUSD" as InstrumentId, timeframeSeconds: 3600,
    startAt: "2026-10-01T00:00:00Z", endAt: "2026-10-01T01:00:00Z",
    open: 3800, high: 3820, low: 3790, close: 3810, volume: 0, source: "biquote",
  });
  const provider: MarketDataProvider = {
    providerId: "biquote",
    capabilities: { quotes: false, trades: false, bars: true, historical: true },
    subscribe: async () => { throw new Error("not supported"); },
    unsubscribe: async () => {},
    historical: vi.fn(async () => [bar]),
    health: async () => ({ providerId: "biquote", healthy: true, checkedAt: "2026-10-01T12:00:00Z" }),
  };
  return provider;
}
async function withServer<T>(provider: MarketDataProvider, tokenPrincipal: ApplicationPrincipal, fn: (url: string, provider: MarketDataProvider) => Promise<T>) {
  const server = createHttpApi({
    application: makeApplication(),
    historicalMarketDataProvider: provider,
    authenticate: staticBearerAuthenticator(new Map([["test-token", tokenPrincipal]])),
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("server did not bind");
  try { return await fn(`http://127.0.0.1:${address.port}`, provider); }
  finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
}

describe("historical market-data API", () => {
  it("serves provider candles only after account market-data authorization", async () => {
    const provider = makeProvider();
    await withServer(provider, principal, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/market-data/XAUUSD/history?accountId=ACC-HISTORY&startAt=2026-10-01T00%3A00%3A00Z&endAt=2026-10-02T00%3A00%3A00Z`, {
        headers: { authorization: "Bearer test-token" },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ instrumentId: "XAUUSD", provider: "biquote", bars: [{ close: 3810, volume: 0 }] });
      expect(provider.historical).toHaveBeenCalledWith("XAUUSD", "bar", "2026-10-01T00:00:00Z", "2026-10-02T00:00:00Z");
    });
  });

  it("does not call the provider for an unauthorized account", async () => {
    const provider = makeProvider();
    const unauthorized: ApplicationPrincipal = { id: "other-user", roles: ["viewer"] };
    await withServer(provider, unauthorized, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/market-data/XAUUSD/history?accountId=ACC-HISTORY&startAt=2026-10-01T00%3A00%3A00Z&endAt=2026-10-02T00%3A00%3A00Z`, {
        headers: { authorization: "Bearer test-token" },
      });
      expect(response.status).toBe(403);
      expect(provider.historical).not.toHaveBeenCalled();
    });
  });
});
