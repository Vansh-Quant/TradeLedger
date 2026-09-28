import { describe, expect, it } from "vitest";
import {
  createAccount, createAccountPortfolio, createExecution, createOrder, createPortfolio,
  createExecutionReconciliation, reconcileExecution, type InstrumentId,
} from "../../core/domain/src/index.js";

const account = createAccount({ id: "ACC-001", baseCurrency: "USD" });
const instrumentId = "AAPL" as InstrumentId;

function makeOrder() {
  return createOrder({ id: "ORD-001", accountId: account.id, instrumentId, side: "buy", type: "limit", quantity: 10, limitPrice: 100, timeInForce: "day", createdAt: "2026-09-28T10:00:00Z" });
}
function acknowledgedOrder() {
  return Object.freeze({ ...makeOrder(), status: "acknowledged" as const });
}
function makeState() {
  return createExecutionReconciliation(acknowledgedOrder(), createAccountPortfolio(account, createPortfolio()));
}
function makeExecution(id = "EXE-001", quantity = 4) {
  return createExecution({ id, orderId: "ORD-001", instrumentId, side: "buy", quantity, price: 100, executedAt: "2026-09-28T10:01:00Z", commission: 1 });
}

describe("execution state reconciliation", () => {
  it("creates state only for a matching account", () => {
    const state = makeState();
    expect(state.order.accountId).toBe(state.accountPortfolio.accountId);
    expect(state.appliedExecutionIds.size).toBe(0);
    expect(Object.isFrozen(state)).toBe(true);
  });
  it("rejects an order/account mismatch", () => {
    const other = createAccount({ id: "ACC-002", baseCurrency: "USD" });
    expect(() => createExecutionReconciliation(makeOrder(), createAccountPortfolio(other, createPortfolio()))).toThrow("order accountId does not match account portfolio");
  });
  it("applies an execution to order and portfolio state", () => {
    const result = reconcileExecution(makeState(), makeExecution());
    expect(result.applied).toBe(true);
    expect(result.state.order.status).toBe("partially_filled");
    expect(result.state.order.filledQuantity).toBe(4);
    expect(result.state.accountPortfolio.portfolio.positions.get("AAPL")?.quantity).toBe(4);
    expect(result.state.appliedExecutionIds.has("EXE-001")).toBe(true);
  });
  it("completes the order after cumulative executions", () => {
    const first = reconcileExecution(makeState(), makeExecution("EXE-001", 4));
    const second = reconcileExecution(first.state, makeExecution("EXE-002", 6));
    expect(second.state.order.status).toBe("filled");
    expect(second.state.order.filledQuantity).toBe(10);
    expect(second.state.accountPortfolio.portfolio.positions.get("AAPL")?.quantity).toBe(10);
    expect(second.state.appliedExecutionIds.size).toBe(2);
  });
  it("is idempotent for duplicate execution delivery", () => {
    const first = reconcileExecution(makeState(), makeExecution());
    const duplicate = reconcileExecution(first.state, makeExecution());
    expect(duplicate.applied).toBe(false);
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.state).toBe(first.state);
    expect(duplicate.state.accountPortfolio.portfolio.positions.get("AAPL")?.quantity).toBe(4);
  });
  it("rejects an execution for another order", () => {
    const execution = createExecution({ id: "EXE-002", orderId: "ORD-999", instrumentId, side: "buy", quantity: 4, price: 100, executedAt: "2026-09-28T10:02:00Z", commission: 0 });
    expect(() => reconcileExecution(makeState(), execution)).toThrow("execution orderId does not match order id");
  });
  it("rejects instrument and side mismatches", () => {
    const wrongInstrument = createExecution({ id: "EXE-003", orderId: "ORD-001", instrumentId: "MSFT" as InstrumentId, side: "buy", quantity: 1, price: 100, executedAt: "2026-09-28T10:03:00Z", commission: 0 });
    expect(() => reconcileExecution(makeState(), wrongInstrument)).toThrow("execution instrumentId does not match order instrument");
    const wrongSide = createExecution({ id: "EXE-004", orderId: "ORD-001", instrumentId, side: "sell", quantity: 1, price: 100, executedAt: "2026-09-28T10:04:00Z", commission: 0 });
    expect(() => reconcileExecution(makeState(), wrongSide)).toThrow("execution side does not match order side");
  });
  it("rejects an execution that overfills the order", () => {
    expect(() => reconcileExecution(makeState(), makeExecution("EXE-005", 11))).toThrow("fillQuantity cannot exceed remaining order quantity");
  });
  it("does not mutate the previous reconciliation state", () => {
    const state = makeState();
    const result = reconcileExecution(state, makeExecution());
    expect(state.order.filledQuantity).toBe(0);
    expect(state.accountPortfolio.portfolio.positions.size).toBe(0);
    expect(result.state).not.toBe(state);
  });
  it("preserves execution identity in the applied set", () => {
    const result = reconcileExecution(makeState(), makeExecution());
    expect([...result.state.appliedExecutionIds]).toEqual(["EXE-001"]);
  });
});