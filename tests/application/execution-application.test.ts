import { describe, expect, it } from "vitest";
import {
  AllowListedAuthorization,
  InMemoryAuditEventStore,
  InMemoryExecutionEventStore,
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

const principal: ApplicationPrincipal = { id: "execution-user", roles: ["trader"] };
const account = createAccount({ id: "ACC-EXEC", baseCurrency: "USD" });

function makeContext(): TradingContext {
  return {
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
}

function makeService(permissions: readonly string[] = [
  "execution-user:order.submit:ACC-EXEC",
  "execution-user:execution.record:ACC-EXEC",
]) {
  const orders = new InMemoryOrderStateStore();
  const contexts = new InMemoryTradingContext([makeContext()]);
  const executions = new InMemoryExecutionEventStore();
  const application = new TradingApplicationService(
    contexts,
    orders,
    new AllowListedAuthorization(permissions),
    fixedOrderIdGenerator("ORD-EXEC-001"),
    fixedClock("2026-10-04T10:00:00Z"),
    undefined,
    new InMemoryAuditEventStore(),
    undefined,
    undefined,
    executions,
  );
  return { application, orders, contexts, executions };
}

function submit(application: TradingApplicationService) {
  return application.submitOrderFromIntent({
    principal,
    accountId: "ACC-EXEC",
    instrumentId: "AAPL",
    side: "buy",
    type: "limit",
    quantity: 10,
    limitPrice: 100,
    timeInForce: "day",
  });
}

function execution(overrides: Partial<{
  executionId: string;
  quantity: number;
}> = {}) {
  return {
    principal,
    accountId: "ACC-EXEC",
    orderId: "ORD-EXEC-001",
    executionId: overrides.executionId ?? "EXE-001",
    instrumentId: "AAPL",
    side: "buy" as const,
    quantity: overrides.quantity ?? 4,
    price: 100,
    executedAt: "2026-10-04T10:01:00Z",
    commission: 1,
  };
}

describe("execution application ingress", () => {
  it("applies a partial fill and releases only the filled reservation", () => {
    const { application, orders, contexts, executions } = makeService();
    submit(application);

    const result = application.recordExecution(execution());

    expect(result.applied).toBe(true);
    expect(result.duplicate).toBe(false);
    expect(result.order.status).toBe("partially_filled");
    expect(result.order.filledQuantity).toBe(4);
    expect(result.state.buyingPower.reservedCapacity).toBe(600);
    expect(result.state.reconciliation.accountPortfolio.portfolio.positions.get("AAPL")?.quantity).toBe(4);
    expect(executions.hasExecution("EXE-001")).toBe(true);
    expect(orders.get("ORD-EXEC-001")).toBe(result.state);
    expect(contexts.getContext("ACC-EXEC").accountPortfolio.portfolio.positions.get("AAPL")?.quantity).toBe(4);
  });

  it("completes a full fill", () => {
    const { application } = makeService();
    submit(application);

    const result = application.recordExecution(execution({ quantity: 10 }));

    expect(result.applied).toBe(true);
    expect(result.order.status).toBe("filled");
    expect(result.order.filledQuantity).toBe(10);
    expect(result.state.buyingPower.reservedCapacity).toBe(0);
  });

  it("treats duplicate execution delivery as idempotent", () => {
    const { application, executions } = makeService();
    submit(application);

    const first = application.recordExecution(execution());
    const second = application.recordExecution({
      ...execution(),
      requestId: "second-request",
    });

    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.state.order.filledQuantity).toBe(4);
    expect(executions.listByOrderId("ORD-EXEC-001")).toHaveLength(1);
  });

  it("rejects an execution for an unknown order", () => {
    const { application } = makeService();

    expect(() => application.recordExecution({
      ...execution(),
      orderId: "ORD-MISSING",
    })).toThrow("was not found");
  });

  it("rejects an execution with mismatched instrument", () => {
    const { application } = makeService();
    submit(application);

    expect(() => application.recordExecution({
      ...execution(),
      instrumentId: "MSFT",
    })).toThrow("execution instrument does not match order");
  });

  it("rejects unauthorized execution recording", () => {
    const { application } = makeService([]);
    expect(() => application.recordExecution(execution())).toThrow("not authorized");
  });
});
