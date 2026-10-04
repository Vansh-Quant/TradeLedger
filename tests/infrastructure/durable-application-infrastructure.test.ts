import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DurableJsonStore,
  DurableOrderStateStore,
  DurableTradingContextStore,
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
import type { AccountId } from "../../core/domain/src/index.js";
import type { TradingContext } from "../../packages/application/src/index.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function root(): string {
  const value = mkdtempSync(join(tmpdir(), "tradeledger-infra-"));
  roots.push(value);
  return value;
}

function accountId(value: string): AccountId {
  return value as AccountId;
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

function state(id: string, orderId = "ORD-1") {
  const account = createAccount({ id, baseCurrency: "USD" });
  const order = createOrder({
    id: orderId,
    accountId: account.id,
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
      accountPortfolio: createAccountPortfolio(account, createPortfolio()),
      appliedExecutionIds: new Set<string>(),
    }),
  };
}

describe("durable application infrastructure", () => {
  it("survives adapter recreation for order state", async () => {
    const directory = root();
    await new DurableOrderStateStore(directory).saveAsync(state("ACC-A"));
    const reloaded = await new DurableOrderStateStore(directory).getAsync("ORD-1");
    expect(reloaded?.order.accountId).toBe(accountId("ACC-A"));
    expect(reloaded?.buyingPower.reservedCapacity).toBe(1_000);
  });

  it("survives adapter recreation for trading context", async () => {
    const directory = root();
    await new DurableTradingContextStore(directory).saveContextAsync(context("ACC-A"));
    expect((await new DurableTradingContextStore(directory).getContextAsync(accountId("ACC-A"))).accountId).toBe(accountId("ACC-A"));
  });

  it("does not return another account's context", async () => {
    const store = new DurableTradingContextStore(root());
    await store.saveContextAsync(context("ACC-A"));
    await expect(store.getContextAsync(accountId("ACC-B"))).rejects.toThrow("not found");
  });

  it("rejects traversal and invalid storage keys", () => {
    const store = new DurableJsonStore(root(), "orders", {
      encode: (value: string) => value,
      decode: (value: unknown) => String(value),
    });
    expect(() => store.save("../escape", "x")).toThrow(PersistenceError);
    expect(() => store.get("a/b")).toThrow(PersistenceError);
  });

  it("fails closed on malformed JSON", () => {
    const directory = root();
    const store = new DurableJsonStore(directory, "orders", {
      encode: (value: string) => value,
      decode: (value: unknown) => {
        if (typeof value !== "string") throw new PersistenceError("invalid");
        return value;
      },
    });
    store.save("ORD-1", "valid");
    writeFileSync(join(directory, "orders", "ORD-1.json"), "{broken");
    expect(() => store.get("ORD-1")).toThrow("invalid JSON");
  });

  it("fails closed on malformed trading state", async () => {
    const directory = root();
    const store = new DurableOrderStateStore(directory);
    await store.saveAsync(state("ACC-A"));
    const path = join(directory, "orders", "ORD-1.json");
    const raw = JSON.parse(readFileSync(path, "utf8")) as { order: { quantity: number } };
    raw.order.quantity = -1;
    writeFileSync(path, JSON.stringify(raw));
    await expect(store.getAsync("ORD-1")).rejects.toThrow("order.quantity must be positive");
  });

  it("rejects symbolic-link persisted files", () => {
    const directory = root();
    const store = new DurableJsonStore(directory, "orders", {
      encode: (value: string) => value,
      decode: (value: unknown) => String(value),
    });
    store.save("ORD-1", "safe");
    const target = join(directory, "orders", "ORD-1.json");
    const link = join(directory, "orders", "ORD-2.json");
    try {
      symlinkSync(target, link);
    } catch {
      return;
    }
    expect(() => store.get("ORD-2")).toThrow("symbolic link");
  });

  it("never persists an application principal or credential field", async () => {
    const directory = root();
    const store = new DurableTradingContextStore(directory);
    await store.saveContextAsync(context("ACC-A"));
    const text = readFileSync(join(directory, "contexts", "ACC-A.json"), "utf8");
    expect(text).not.toContain("password");
    expect(text).not.toContain("token");
    expect(text).not.toContain("apiKey");
  });
});
