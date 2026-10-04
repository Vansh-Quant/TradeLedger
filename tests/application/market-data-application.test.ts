import { describe, expect, it } from "vitest";
import {
  AllowListedAuthorization,
  InMemoryMarketDataStateStore,
  InMemoryOrderStateStore,
  InMemoryTradingContext,
  TradingApplicationService,
  fixedClock,
  fixedOrderIdGenerator,
  type ApplicationPrincipal,
  type TradingContext,
} from "../../packages/application/src/index.js";
import { createQuote } from "../../core/domain/src/index.js";

const principal: ApplicationPrincipal = { id: "md-user", roles: ["trader"] };
const account = {
  id: "ACC-MD" as const,
  baseCurrency: "USD" as const,
};

const context: TradingContext = {
  accountId: account.id,
  accountPortfolio: (await import("../../core/domain/src/index.js")).createAccountPortfolio(
    (await import("../../core/domain/src/index.js")).createAccount(account),
    (await import("../../core/domain/src/index.js")).createPortfolio(),
  ),
  buyingPower: (await import("../../core/domain/src/index.js")).createBuyingPower(10_000),
  riskLimits: (await import("../../core/domain/src/index.js")).createRiskLimits({
    maxOrderNotional: 5_000,
    maxPositionNotional: 10_000,
    maxGrossExposure: 20_000,
    maxNetExposure: 15_000,
    maxDailyLoss: 1_000,
  }),
};

describe("application market data boundary", () => {
  it("lists and reads market data through authorization", () => {
    const store = new InMemoryMarketDataStateStore();
    store.accept("AAPL", createQuote({
      instrumentId: "AAPL",
      bid: 100,
      bidSize: 10,
      ask: 100.25,
      askSize: 10,
      observedAt: "2026-10-04T09:30:00Z",
    }), "2026-10-04T09:30:01Z");

    const service = new TradingApplicationService(
      new InMemoryTradingContext([context]),
      new InMemoryOrderStateStore(),
      new AllowListedAuthorization(["md-user:market-data.read:ACC-MD"]),
      fixedOrderIdGenerator("unused"),
      fixedClock("2026-10-04T09:30:02Z"),
      undefined,
      undefined,
      undefined,
      store,
    );

    expect(service.listMarketData({ principal, accountId: "ACC-MD" })).toHaveLength(1);
    expect(service.getMarketData({
      principal,
      accountId: "ACC-MD",
      instrumentId: "AAPL",
    })?.latestQuote?.bid).toBe(100);
  });

  it("rejects unauthorized market data reads", () => {
    const service = new TradingApplicationService(
      new InMemoryTradingContext([context]),
      new InMemoryOrderStateStore(),
      new AllowListedAuthorization([]),
      fixedOrderIdGenerator("unused"),
      fixedClock("2026-10-04T09:30:02Z"),
    );

    expect(() => service.listMarketData({
      principal,
      accountId: "ACC-MD",
    })).toThrow("not authorized");
  });
});
