import { describe, expect, it } from "vitest";
import {
  applyExecutionToAccountPortfolio,
  createAccount,
  createAccountPortfolio,
  createExecution,
  createPortfolio,
  type InstrumentId,
} from "../../core/domain/src/index.js";

describe("AccountPortfolio", () => {
  const account = createAccount({ id: "ACC-001", baseCurrency: "USD" });
  const instrumentId = "AAPL" as InstrumentId;

  it("binds an account to an empty portfolio", () => {
    const state = createAccountPortfolio(account, createPortfolio());

    expect(state.accountId).toBe("ACC-001");
    expect(state.portfolio.positions.size).toBe(0);
    expect(Object.isFrozen(state)).toBe(true);
  });

  it("derives a position from an actual execution", () => {
    const state = createAccountPortfolio(account, createPortfolio());
    const execution = createExecution({
      id: "EXE-001",
      orderId: "ORD-001",
      instrumentId,
      side: "buy",
      quantity: 10,
      price: 100,
      executedAt: "2026-09-19T10:00:00Z",
      commission: 1,
    });

    const updated = applyExecutionToAccountPortfolio(state, execution);
    const position = updated.portfolio.positions.get("AAPL");

    expect(position?.quantity).toBe(10);
    expect(position?.averagePrice).toBe(100);
    expect(updated.portfolio.marketValue).toBe(1_000);
  });

  it("accumulates multiple executions for the same instrument", () => {
    const state = createAccountPortfolio(account, createPortfolio());
    const first = createExecution({
      id: "EXE-001",
      orderId: "ORD-001",
      instrumentId,
      side: "buy",
      quantity: 10,
      price: 100,
      executedAt: "2026-09-19T10:00:00Z",
      commission: 1,
    });
    const second = createExecution({
      id: "EXE-002",
      orderId: "ORD-002",
      instrumentId,
      side: "buy",
      quantity: 10,
      price: 120,
      executedAt: "2026-09-19T10:01:00Z",
      commission: 1,
    });

    const updated = applyExecutionToAccountPortfolio(
      applyExecutionToAccountPortfolio(state, first),
      second,
    );
    const position = updated.portfolio.positions.get("AAPL");

    expect(position?.quantity).toBe(20);
    expect(position?.averagePrice).toBe(110);
  });

  it("realizes P&L when an execution closes a position", () => {
    const state = createAccountPortfolio(account, createPortfolio());
    const open = createExecution({
      id: "EXE-001",
      orderId: "ORD-001",
      instrumentId,
      side: "buy",
      quantity: 10,
      price: 100,
      executedAt: "2026-09-19T10:00:00Z",
      commission: 1,
    });
    const close = createExecution({
      id: "EXE-002",
      orderId: "ORD-002",
      instrumentId,
      side: "sell",
      quantity: 10,
      price: 115,
      executedAt: "2026-09-19T10:01:00Z",
      commission: 1,
    });

    const updated = applyExecutionToAccountPortfolio(
      applyExecutionToAccountPortfolio(state, open),
      close,
    );

    expect(updated.portfolio.positions.has("AAPL")).toBe(false);
    expect(updated.portfolio.realizedPnl).toBe(150);
  });

  it("does not mutate the previous account portfolio state", () => {
    const state = createAccountPortfolio(account, createPortfolio());
    const execution = createExecution({
      id: "EXE-001",
      orderId: "ORD-001",
      instrumentId,
      side: "buy",
      quantity: 5,
      price: 200,
      executedAt: "2026-09-19T10:00:00Z",
      commission: 1,
    });

    const updated = applyExecutionToAccountPortfolio(state, execution);

    expect(state.portfolio.positions.size).toBe(0);
    expect(updated.portfolio.positions.size).toBe(1);
  });

  it("preserves the account identity across portfolio updates", () => {
    const state = createAccountPortfolio(account, createPortfolio());
    const execution = createExecution({
      id: "EXE-001",
      orderId: "ORD-001",
      instrumentId,
      side: "sell",
      quantity: 3,
      price: 250,
      executedAt: "2026-09-19T10:00:00Z",
      commission: 0,
    });

    const updated = applyExecutionToAccountPortfolio(state, execution);

    expect(updated.accountId).toBe(account.id);
  });
});
