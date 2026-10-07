import { describe, expect, it } from "vitest";
import {
  AllowListedAuthorization,
  InMemoryAuditEventStore,
  InMemoryApplicationEventBus,
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
    "user-1:order.expire:ACC-APP",
  ],
) {
  const orders = new InMemoryOrderStateStore();
  const audit = new InMemoryAuditEventStore();
  const events = new InMemoryApplicationEventBus();
  const tradingContext = new InMemoryTradingContext([context]);
  const application = new TradingApplicationService(
    tradingContext,
    orders,
    new AllowListedAuthorization(permissions),
    fixedOrderIdGenerator("ORD-APP-001"),
    fixedClock("2026-10-03T12:00:00.000Z"),
    undefined,
    audit,
    undefined,
    undefined,
    undefined,
    events,
  );
  return { application, orders, audit, events };
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

  it("publishes an order.rejected event when admission fails", () => {
    const { application, events } = service();

    const result = application.submitOrder({
      ...command(),
      orderNotional: 6_000,
      requestId: "req-rejected-event-1",
    });

    expect(result.admitted).toBe(false);
    expect(events.listAfterSequence(0).map((event) => event.type)).toEqual([
      "order.rejected",
    ]);
    expect(events.listAfterSequence(0)[0]?.payload.reason).toContain("order notional");
  });

  it("rejects unauthorized commands before touching the domain", () => {
    const { application } = service([]);

    expect(() =>
      application.submitOrder(command()),
    ).toThrowError("not authorized");
  });

  it("lists account orders without leaking another account", () => {
    const { application } = service();
    const submitted = application.submitOrder(command());
    const result = application.listOrders({ principal, accountId: "ACC-APP" });

    expect(result.orders).toHaveLength(1);
    expect(result.orders[0]?.order.id).toBe(submitted.order.id);
    expect(result.orders[0]?.state).toBe(submitted.state);
  });

  it("derives workstation admission inputs on the application side", () => {
    const { application } = service();
    const result = application.submitOrderFromIntent({
      ...command(),
    });
    expect(result.admitted).toBe(true);
    expect(result.state.buyingPower.reservedCapacity).toBe(1_000);
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

    expect(result.order.status).toBe("cancel_requested");
    expect(result.state.buyingPower.reservedCapacity).toBe(1_000);
    expect(result.state.reservation?.remainingAmount).toBe(1_000);

    const completed = application.completeOrderCancellation({
      principal,
      accountId: "ACC-APP",
      orderId: submitted.order.id,
    });

    expect(completed.order.status).toBe("cancelled");
    expect(completed.state.buyingPower.reservedCapacity).toBe(0);
    expect(completed.state.reservation?.remainingAmount).toBe(0);
  });

  it("expires through the canonical reservation lifecycle", () => {
    const { application } = service();

    const submitted = application.submitOrder(command());
    const result = application.expireOrder({
      principal,
      accountId: "ACC-APP",
      orderId: submitted.order.id,
    });

    expect(result.order.status).toBe("expired");
    expect(result.state.buyingPower.reservedCapacity).toBe(0);
    expect(result.state.reservation?.remainingAmount).toBe(0);
  });

  it("publishes an order.expired event only after expiry succeeds", () => {
    const { application, events } = service();

    const submitted = application.submitOrder(command());
    application.expireOrder({
      principal,
      accountId: "ACC-APP",
      orderId: submitted.order.id,
      requestId: "req-expire-1",
      idempotencyKey: "expire-1",
    });

    expect(events.listAfterSequence(0).map((event) => event.type)).toEqual([
      "order.submitted",
      "order.expired",
    ]);
  });

  it("persists buying-power changes across commands", () => {
    const { application } = service();

    application.submitOrder(command());
    const second = application.submitOrder({
      ...command(),
      orderNotional: 4_500,
      projectedPositionNotional: 4_500,
      projectedGrossExposure: 4_500,
      projectedNetExposure: 4_500,
    });

    expect(second.admitted).toBe(true);
    expect(second.state.buyingPower.reservedCapacity).toBe(5_500);
  });

  it("publishes ordered lifecycle events without duplicating idempotent replays", () => {
    const { application, events } = service();
    const first = application.submitOrder({ ...command(), idempotencyKey: "event-1", requestId: "req-event-1" });
    application.submitOrder({ ...command(), idempotencyKey: "event-1", requestId: "req-event-2" });
    const cancelled = application.cancelOrder({ principal, accountId: "ACC-APP", orderId: first.order.id, idempotencyKey: "event-cancel-1", requestId: "req-cancel-1" });
    application.completeOrderCancellation({ principal, accountId: "ACC-APP", orderId: cancelled.order.id, idempotencyKey: "event-cancel-complete-1", requestId: "req-cancel-complete-1" });

    expect(events.listAfterSequence(0).map((event) => event.type)).toEqual([
      "order.submitted", "order.cancel.requested", "order.cancelled",
    ]);
    expect(events.listAfterSequence(0).map((event) => event.sequence)).toEqual([1, 2, 3]);
  });

  it("publishes an execution event only for a newly applied execution", () => {
    const { application, events } = service([
      "user-1:order.submit:ACC-APP",
      "user-1:order.read:ACC-APP",
      "user-1:order.cancel:ACC-APP",
      "user-1:execution.record:ACC-APP",
    ]);
    const submitted = application.submitOrder(command());
    application.recordExecution({
      principal,
      accountId: "ACC-APP",
      orderId: submitted.order.id,
      executionId: "EXE-EVENT-1",
      instrumentId: "AAPL",
      side: "buy",
      quantity: 4,
      price: 100,
      executedAt: "2026-10-03T12:01:00.000Z",
      commission: 1,
      requestId: "req-execution-event-1",
      idempotencyKey: "execution-event-1",
    });
    application.recordExecution({
      principal,
      accountId: "ACC-APP",
      orderId: submitted.order.id,
      executionId: "EXE-EVENT-1",
      instrumentId: "AAPL",
      side: "buy",
      quantity: 4,
      price: 100,
      executedAt: "2026-10-03T12:01:00.000Z",
      commission: 1,
      requestId: "req-execution-event-2",
      idempotencyKey: "execution-event-1",
    });
    expect(events.listAfterSequence(0).map((event) => event.type)).toEqual([
      "order.submitted", "execution.recorded",
    ]);
  });

  it("streams only authorized account events and unsubscribes cleanly", () => {
    const { application, events } = service([
      "user-1:order.submit:ACC-APP",
      "user-1:order.read:ACC-APP",
      "user-1:event-stream.read:ACC-APP",
    ]);
    const received: string[] = [];
    const unsubscribe = application.subscribeToEvents(principal, "ACC-APP", (event) => received.push(event.eventId));
    application.submitOrder({ ...command(), requestId: "req-stream-1" });
    expect(received).toHaveLength(1);
    unsubscribe();
    application.submitOrder({ ...command(), requestId: "req-stream-2" });
    expect(received).toHaveLength(1);
    expect(application.listEventsAfter(principal, "ACC-APP", 0)).toHaveLength(2);
    expect(events.latestSequence()).toBe(2);
  });

  it("denies event subscriptions without the event-stream permission", () => {
    const { application } = service();
    expect(() => application.subscribeToEvents(principal, "ACC-APP", () => undefined)).toThrowError("not authorized");
    expect(() => application.listEventsAfter(principal, "ACC-APP", 0)).toThrowError("not authorized");
  });

  it("preserves immutable state across command execution", () => {
    const { application, orders } = service();

    const submitted = application.submitOrder(command());
    const stored = orders.get(submitted.order.id);

    expect(stored).toBe(submitted.state);
    expect(stored?.order.status).toBe("acknowledged");
  });
  it("replays an idempotent submission without creating another order", () => {
    const { application } = service();
    const first = application.submitOrder({ ...command(), idempotencyKey: "app-replay-1", requestId: "req-1" });
    const second = application.submitOrder({ ...command(), idempotencyKey: "app-replay-1", requestId: "req-2" });
    expect(second).toEqual(first);
  });

  it("rejects conflicting idempotency reuse", () => {
    const { application } = service();
    application.submitOrder({ ...command(), idempotencyKey: "app-conflict-1" });
    expect(() => application.submitOrder({
      ...command(),
      quantity: 11,
      idempotencyKey: "app-conflict-1",
    })).toThrowError("idempotency key conflicts");
  });

  it("audits replay and conflicting idempotency reuse", () => {
    const { application, audit } = service();
    application.submitOrder({ ...command(), idempotencyKey: "audit-1", requestId: "req-1" });
    application.submitOrder({ ...command(), idempotencyKey: "audit-1", requestId: "req-2" });
    expect(audit.events.map((event) => event.type)).toContain("order.submit.replay");
    expect(() => application.submitOrder({
      ...command(),
      quantity: 11,
      idempotencyKey: "audit-1",
    })).toThrowError("idempotency key conflicts");
    expect(audit.events.map((event) => event.type)).toContain("idempotency.conflict");
  });

  it("does not allow a key to cross principals", () => {
    const { application } = service([
      "user-1:order.submit:ACC-APP",
      "user-1:order.read:ACC-APP",
      "user-1:order.cancel:ACC-APP",
      "user-2:order.submit:ACC-APP",
    ]);
    application.submitOrder({ ...command(), idempotencyKey: "principal-1" });
    expect(() => application.submitOrder({
      ...command(),
      principal: { id: "user-2", roles: ["trader"] },
      idempotencyKey: "principal-1",
    })).toThrowError("idempotency key conflicts");
  });

  it("does not allow cancel and cancellation completion to share a key", () => {
    const { application } = service();
    const submitted = application.submitOrder(command());
    application.cancelOrder({
      principal,
      accountId: "ACC-APP",
      orderId: submitted.order.id,
      idempotencyKey: "cancel-op-1",
    });
    expect(() => application.completeOrderCancellation({
      principal,
      accountId: "ACC-APP",
      orderId: submitted.order.id,
      idempotencyKey: "cancel-op-1",
    })).toThrowError("idempotency key conflicts");
  });

});
