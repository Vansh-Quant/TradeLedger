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
    expect(reloaded.getContext("ACC-TX").accountId).toBe("ACC-TX");
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
    expect(() => reloaded.getContext("ACC-TX")).toThrow("not found");
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
    firstPersistence.saveContext(context("ACC-TX"));

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
