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

const principal: ApplicationPrincipal = {
  id: "user-1",
  roles: ["trader"],
};

const account = createAccount({
  id: "ACC-APP",
  baseCurrency: "USD",
});

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

function service(
  permissions: readonly string[] = [
    "user-1:order.submit:ACC-APP",
    "user-1:order.read:ACC-APP",
    "user-1:order.cancel:ACC-APP",
  ],
) {
  const orders = new InMemoryOrderStateStore();
  const tradingContext = new InMemoryTradingContext([context]);
  const application = new TradingApplicationService(
    tradingContext,
    orders,
    new AllowListedAuthorization(permissions),
    fixedOrderIdGenerator("ORD-APP-001"),
    fixedClock("2026-10-03T12:00:00.000Z"),
  );
  return { application, orders };
}

function command() {
  return {
    principal,
    accountId: "ACC-APP",
    instrumentId: "AAPL",
    side: "buy" as const,
    type: "limit" as const,
    quantity: 10,
    limitPrice: 100,
    timeInForce: "day" as const,
    orderNotional: 1_000,
    projectedPositionNotional: 1_000,
    projectedGrossExposure: 1_000,
    projectedNetExposure: 1_000,
    dailyLoss: 0,
  };
}

describe("trading application service", () => {
  it("validates, authorizes, and admits an order through the domain workflow", () => {
    const { application } = service();

    const result = application.submitOrder(command());

    expect(result.admitted).toBe(true);
    expect(result.order.status).toBe("acknowledged");
    expect(result.state.buyingPower.reservedCapacity).toBe(1_000);
  });

  it("does not expose domain admission as a successful result when risk rejects", () => {
    const { application } = service();

    const result = application.submitOrder({
      ...command(),
      orderNotional: 6_000,
    });

    expect(result.admitted).toBe(false);
    expect(result.reason).toContain("order notional");
    expect(result.order.status).toBe("rejected");
    expect(result.state.buyingPower.reservedCapacity).toBe(0);
  });

  it("rejects unauthorized commands before touching the domain", () => {
    const { application } = service([]);

    expect(() =>
      application.submitOrder(command()),
    ).toThrowError("not authorized");
  });

  it("maps missing and cross-account orders to not found", () => {
    const { application } = service();

    expect(() =>
      application.getOrder({
        principal,
        accountId: "ACC-APP",
        orderId: "missing",
      }),
    ).toThrowError("was not found");
  });

  it("cancels through the canonical reservation lifecycle", () => {
    const { application } = service();

    const submitted = application.submitOrder(command());
    const result = application.cancelOrder({
      principal,
      accountId: "ACC-APP",
      orderId: submitted.order.id,
    });

    expect(result.order.status).toBe("cancelled");
    expect(result.state.buyingPower.reservedCapacity).toBe(0);
    expect(result.state.reservation?.remainingAmount).toBe(0);
  });

  it("persists buying-power changes across commands", () => {
    const { application } = service();

    application.submitOrder(command());
    const second = application.submitOrder({
      ...command(),
      orderNotional: 9_001,
      projectedPositionNotional: 9_001,
      projectedGrossExposure: 9_001,
      projectedNetExposure: 9_001,
    });

    expect(second.admitted).toBe(false);
    expect(second.reason).toContain("buying power");
  });

  it("preserves immutable state across command execution", () => {
    const { application, orders } = service();

    const submitted = application.submitOrder(command());
    const stored = orders.get(submitted.order.id);

    expect(stored).toBe(submitted.state);
    expect(stored?.order.status).toBe("acknowledged");
  });
});
