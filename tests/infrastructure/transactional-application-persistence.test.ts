import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  TransactionalApplicationPersistence,
  PersistenceError,
} from "../../core/infrastructure/src/index.js";
import {
  createAccount,
  createAccountPortfolio,
  createBuyingPower,
  createOrder,
  createPortfolio,
  createRiskLimits,
} from "../../core/domain/src/index.js";
import type { AccountId, TradingCoreState } from "../../core/domain/src/index.js";
import type { TradingContext } from "../../packages/application/src/index.js";
import {
  AllowListedAuthorization,
  TradingApplicationService,
  fixedClock,
  fixedOrderIdGenerator,
} from "../../packages/application/src/index.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function root(): string {
  const value = mkdtempSync(join(tmpdir(), "tradeledger-tx-"));
  roots.push(value);
  return value;
}

function context(id: string): TradingContext {
  const account = createAccount({ id, baseCurrency: "USD" });
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

function state(account: string, orderId = "ORD-TX-1"): TradingCoreState {
  const accountValue = createAccount({ id: account, baseCurrency: "USD" });
  const order = createOrder({
    id: orderId,
    accountId: accountValue.id,
    instrumentId: "AAPL" as never,
    side: "buy",
    type: "limit",
    quantity: 10,
    limitPrice: 100,
    timeInForce: "day",
    createdAt: "2026-10-04T00:00:00.000Z",
  });
  return {
    order,
    buyingPower: createBuyingPower(10_000, 1_000),
    reservation: Object.freeze({ orderId, initialAmount: 1_000, remainingAmount: 1_000, quantity: 10 }),
    reconciliation: Object.freeze({
      order,
      accountPortfolio: createAccountPortfolio(accountValue, createPortfolio()),
      appliedExecutionIds: new Set<string>(),
    }),
  };
}

describe("transactional application persistence", () => {
  it("commits order, context, mutation, and audit state as one snapshot", () => {
    const directory = root();
    const store = new TransactionalApplicationPersistence(directory);

    store.execute(() => {
      store.save(state("ACC-TX"));
      store.saveContext(context("ACC-TX"));
      store.executeOnce(
        "tx-commit-1",
        "order.submit",
        "ACC-TX" as AccountId,
        { id: "user-1" },
        "a".repeat(64),
        () => ({ accepted: true }),
      );
      store.append({
        id: "evt-1",
        type: "order.submit.completed",
        timestamp: "2026-10-04T00:00:00.000Z",
        principalId: "user-1",
        accountId: "ACC-TX" as AccountId,
        action: "order.submit",
        requestId: "req-1",
        idempotencyKey: "tx-commit-1",
        outcome: "success",
      });
    });

    const reloaded = new TransactionalApplicationPersistence(directory);
    expect(reloaded.get("ORD-TX-1")?.order.accountId).toBe("ACC-TX");
    expect(reloaded.getContext("ACC-TX" as AccountId).accountId).toBe("ACC-TX");
    expect(reloaded.executeOnce(
      "tx-commit-1",
      "order.submit",
      "ACC-TX" as AccountId,
      { id: "user-1" },
      "a".repeat(64),
      () => ({ accepted: false }),
    )).toEqual({ accepted: true });
  });

  it("rolls back every application collection when a transaction fails", () => {
    const directory = root();
    const store = new TransactionalApplicationPersistence(directory);

    expect(() => store.execute(() => {
      store.save(state("ACC-TX"));
      store.saveContext(context("ACC-TX"));
      store.append({
        id: "evt-rollback",
        type: "order.submit.requested",
        timestamp: "2026-10-04T00:00:00.000Z",
        principalId: "user-1",
        accountId: "ACC-TX" as AccountId,
        action: "order.submit",
        requestId: "req-rollback",
        outcome: "success",
      });
      throw new Error("abort");
    })).toThrow("abort");

    const reloaded = new TransactionalApplicationPersistence(directory);
    expect(reloaded.get("ORD-TX-1")).toBeUndefined();
    expect(() => reloaded.getContext("ACC-TX" as AccountId)).toThrow("not found");
    expect(() => reloaded.executeOnce(
      "tx-commit-1",
      "order.submit",
      "ACC-TX" as AccountId,
      { id: "user-1" },
      "a".repeat(64),
      () => ({ accepted: true }),
    )).not.toThrow();
  });

  it("integrates with the application service across adapter recreation", () => {
    const directory = root();
    const firstPersistence = new TransactionalApplicationPersistence(directory);
    firstPersistence.execute(() => firstPersistence.saveContext(context("ACC-TX")));

    const firstService = new TradingApplicationService(
      firstPersistence,
      firstPersistence,
      new AllowListedAuthorization(["user-1:order.submit:ACC-TX"]),
      fixedOrderIdGenerator("ORD-SERVICE-TX"),
      fixedClock("2026-10-04T00:00:00.000Z"),
      firstPersistence,
      firstPersistence,
      firstPersistence,
    );

    const command = {
      principal: { id: "user-1", roles: ["trader"] },
      accountId: "ACC-TX",
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
      requestId: "req-service-1",
      idempotencyKey: "service-replay-1",
    };

    const first = firstService.submitOrder(command);
    const secondPersistence = new TransactionalApplicationPersistence(directory);
    const secondService = new TradingApplicationService(
      secondPersistence,
      secondPersistence,
      new AllowListedAuthorization(["user-1:order.submit:ACC-TX"]),
      fixedOrderIdGenerator("ORD-SERVICE-TX"),
      fixedClock("2026-10-04T00:00:00.000Z"),
      secondPersistence,
      secondPersistence,
      secondPersistence,
    );

    expect(secondService.submitOrder({ ...command, requestId: "req-service-2" })).toEqual(first);
  });

  it("persists application events atomically and replays them after adapter recreation", () => {
    const directory = root();
    const persistence = new TransactionalApplicationPersistence(directory);
    persistence.execute(() => {
      persistence.publish({
        eventId: "event-persist-1",
        type: "order.submitted",
        occurredAt: "2026-10-04T00:00:00.000Z",
        accountId: "ACC-TX" as AccountId,
        aggregateType: "order",
        aggregateId: "ORD-TX-1",
        requestId: "req-event-persist-1",
        sequence: 1,
        payload: { instrumentId: "AAPL", side: "buy", quantity: 10 },
      });
    });
    const reloaded = new TransactionalApplicationPersistence(directory);
    expect(reloaded.latestSequence()).toBe(1);
    expect(reloaded.listAfterSequence(0)).toHaveLength(1);
    expect(reloaded.listAfterSequence(0)[0]?.eventId).toBe("event-persist-1");
  });

  it("rolls back application events with the surrounding transaction", () => {
    const directory = root();
    const persistence = new TransactionalApplicationPersistence(directory);
    expect(() => persistence.execute(() => {
      persistence.publish({
        eventId: "event-rollback-1",
        type: "order.submitted",
        occurredAt: "2026-10-04T00:00:00.000Z",
        accountId: "ACC-TX" as AccountId,
        aggregateType: "order",
        aggregateId: "ORD-TX-1",
        requestId: "req-event-rollback-1",
        sequence: 1,
        payload: { instrumentId: "AAPL", side: "buy", quantity: 10 },
      });
      throw new Error("event abort");
    })).toThrow("event abort");
    expect(persistence.latestSequence()).toBe(0);
    expect(persistence.listAfterSequence(0)).toHaveLength(0);
  });

  it("notifies subscribers only after a durable event commit", () => {
    const directory = root();
    const persistence = new TransactionalApplicationPersistence(directory);
    const received: string[] = [];
    persistence.subscribe("ACC-TX" as AccountId, (event) => received.push(event.eventId));

    expect(() => persistence.execute(() => {
      persistence.publish({
        eventId: "event-no-phantom",
        type: "order.submitted",
        occurredAt: "2026-10-04T00:00:00.000Z",
        accountId: "ACC-TX" as AccountId,
        aggregateType: "order",
        aggregateId: "ORD-TX-1",
        requestId: "req-no-phantom",
        sequence: 1,
        payload: { instrumentId: "AAPL", side: "buy", quantity: 10 },
      });
      throw new Error("abort subscriber test");
    })).toThrow("abort subscriber test");
    expect(received).toEqual([]);

    persistence.execute(() => persistence.publish({
      eventId: "event-committed",
      type: "order.submitted",
      occurredAt: "2026-10-04T00:00:01.000Z",
      accountId: "ACC-TX" as AccountId,
      aggregateType: "order",
      aggregateId: "ORD-TX-1",
      requestId: "req-committed",
      sequence: 1,
      payload: { instrumentId: "AAPL", side: "buy", quantity: 10 },
    }));
    expect(received).toEqual(["event-committed"]);
  });

  it("rejects non-contiguous application event sequences", () => {
    const directory = root();
    const persistence = new TransactionalApplicationPersistence(directory);
    expect(() => persistence.execute(() => persistence.publish({
      eventId: "event-sequence-2",
      type: "order.submitted",
      occurredAt: "2026-10-04T00:00:00.000Z",
      accountId: "ACC-TX" as AccountId,
      aggregateType: "order",
      aggregateId: "ORD-TX-1",
      requestId: "req-event-sequence-2",
      sequence: 2,
      payload: { instrumentId: "AAPL", side: "buy", quantity: 10 },
    }))).toThrow("sequence is not contiguous");
  });

  it("replays a committed idempotent mutation after adapter recreation", () => {
    const directory = root();
    const first = new TransactionalApplicationPersistence(directory);
    first.execute(() => {
      first.executeOnce(
        "restart-replay-1",
        "order.submit",
        "ACC-TX" as AccountId,
        { id: "user-1" },
        "b".repeat(64),
        () => ({ orderId: "ORD-TX-2" }),
      );
    });

    const second = new TransactionalApplicationPersistence(directory);
    expect(second.executeOnce(
      "restart-replay-1",
      "order.submit",
      "ACC-TX" as AccountId,
      { id: "user-1" },
      "b".repeat(64),
      () => ({ orderId: "should-not-run" }),
    )).toEqual({ orderId: "ORD-TX-2" });
  });

  it("persists execution audit events across adapter recreation", () => {
    const directory = root();
    const persistence = new TransactionalApplicationPersistence(directory);
    persistence.execute(() => persistence.append({
      id: "evt-execution-1",
      type: "execution.record.completed",
      timestamp: "2026-10-04T00:00:00.000Z",
      principalId: "user-1",
      accountId: "ACC-TX" as AccountId,
      action: "execution.record",
      requestId: "req-execution-1",
      idempotencyKey: "execution-audit-1",
      outcome: "success",
    }));

    expect(() => new TransactionalApplicationPersistence(directory)).not.toThrow();
  });

  it("persists authorization-denied audit events without credentials", () => {
    const directory = root();
    const persistence = new TransactionalApplicationPersistence(directory);
    persistence.execute(() => persistence.saveContext(context("ACC-TX")));
    const service = new TradingApplicationService(
      persistence,
      persistence,
      new AllowListedAuthorization([]),
      fixedOrderIdGenerator("ORD-DENIED-TX"),
      fixedClock("2026-10-04T00:00:00.000Z"),
      persistence,
      persistence,
      persistence,
    );

    expect(() => service.submitOrder({
      principal: { id: "user-denied", roles: ["trader"] },
      accountId: "ACC-TX",
      instrumentId: "AAPL",
      side: "buy",
      type: "limit",
      quantity: 1,
      limitPrice: 100,
      timeInForce: "day",
      orderNotional: 100,
      projectedPositionNotional: 100,
      projectedGrossExposure: 100,
      projectedNetExposure: 100,
      dailyLoss: 0,
      requestId: "req-denied-1",
      idempotencyKey: "denied-1",
    })).toThrow();

    const snapshot = JSON.parse(readFileSync(join(directory, "application", "state.json"), "utf8")) as {
      auditEvents: Array<{ type: string; idempotencyKey?: string; reason?: string }>;
    };
    expect(snapshot.auditEvents).toEqual([
      expect.objectContaining({
        type: "authorization.denied",
        idempotencyKey: "denied-1",
        reason: "AUTHORIZATION_ERROR",
      }),
    ]);
    expect(JSON.stringify(snapshot)).not.toContain("Authorization");
    expect(JSON.stringify(snapshot)).not.toContain("password");
    expect(JSON.stringify(snapshot)).not.toContain("token");
  });

  it("commits failed mutation outcomes and audit state", () => {
    const directory = root();
    const persistence = new TransactionalApplicationPersistence(directory);
    persistence.execute(() => persistence.saveContext(context("ACC-TX")));
    const service = new TradingApplicationService(
      persistence,
      persistence,
      new AllowListedAuthorization(["user-1:order.cancel:ACC-TX"]),
      fixedOrderIdGenerator("ORD-FAILED-TX"),
      fixedClock("2026-10-04T00:00:00.000Z"),
      persistence,
      persistence,
      persistence,
    );

    expect(() => service.cancelOrder({
      principal: { id: "user-1", roles: ["trader"] },
      accountId: "ACC-TX",
      orderId: "DOES-NOT-EXIST",
      requestId: "req-failed-1",
      idempotencyKey: "failed-mutation-1",
    })).toThrow("was not found");

    const reloaded = new TransactionalApplicationPersistence(directory);
    const replayService = new TradingApplicationService(
      reloaded,
      reloaded,
      new AllowListedAuthorization(["user-1:order.cancel:ACC-TX"]),
      fixedOrderIdGenerator("ORD-FAILED-TX"),
      fixedClock("2026-10-04T00:00:00.000Z"),
      reloaded,
      reloaded,
      reloaded,
    );

    expect(() => replayService.cancelOrder({
      principal: { id: "user-1", roles: ["trader"] },
      accountId: "ACC-TX",
      orderId: "DOES-NOT-EXIST",
      requestId: "req-failed-2",
      idempotencyKey: "failed-mutation-1",
    })).toThrow("previous mutation failed");
  });

  it("fails closed on conflicting persisted idempotency reuse", () => {
    const directory = root();
    const store = new TransactionalApplicationPersistence(directory);
    store.execute(() => {
      store.executeOnce(
        "conflict-1",
        "order.submit",
        "ACC-TX" as AccountId,
        { id: "user-1" },
        "c".repeat(64),
        () => ({ accepted: true }),
      );
    });

    const reloaded = new TransactionalApplicationPersistence(directory);
    expect(() => reloaded.execute(() => reloaded.executeOnce(
      "conflict-1",
      "order.submit",
      "ACC-TX" as AccountId,
      { id: "user-1" },
      "d".repeat(64),
      () => ({ accepted: false }),
    ))).toThrow("idempotency key conflicts");
  });

  it("fails closed on corrupted application snapshots", () => {
    const directory = root();
    const store = new TransactionalApplicationPersistence(directory);
    store.execute(() => store.saveContext(context("ACC-TX")));
    writeFileSync(join(directory, "application", "state.json"), "{broken");
    expect(() => new TransactionalApplicationPersistence(directory)).toThrow(PersistenceError);
    expect(readFileSync(join(directory, "application", "state.json"), "utf8")).toBe("{broken");
  });

  it("rejects a live transaction lock", () => {
    const directory = root();
    const store = new TransactionalApplicationPersistence(directory);
    const lock = join(directory, ".application-transaction.lock");
    writeFileSync(lock, String(process.pid), { encoding: "utf8", flag: "wx" });
    expect(() => store.execute(() => undefined)).toThrow("already in progress");
  });
});
