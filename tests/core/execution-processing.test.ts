import { describe, expect, it } from "vitest";
import {
  InMemoryExecutionEventStore,
  createAccount,
  createAccountPortfolio,
  createExecution,
  createOrder,
  createPortfolio,
  processExecution,
  type InstrumentId,
} from "../../core/domain/src/index.js";

const account = createAccount({ id: "ACC-001", baseCurrency: "USD" });
const instrumentId = "AAPL" as InstrumentId;

function makeState() {
  const order = createOrder({
    id: "ORD-001",
    accountId: account.id,
    instrumentId,
    side: "buy",
    type: "limit",
    quantity: 10,
    limitPrice: 100,
    timeInForce: "day",
    createdAt: "2026-09-28T10:00:00Z",
  });
  return {
    order: Object.freeze({ ...order, status: "acknowledged" as const }),
    accountPortfolio: createAccountPortfolio(account, createPortfolio()),
  };
}

function makeExecution(id = "EXE-001", quantity = 4) {
  return createExecution({
    id,
    orderId: "ORD-001",
    instrumentId,
    side: "buy",
    quantity,
    price: 100,
    executedAt: "2026-09-28T10:01:00Z",
    commission: 1,
  });
}

describe("execution processing workflow", () => {
  it("records and reconciles a new execution", () => {
    const base = makeState();
    const state = processExecution({
      ...base,
      state: {
        ...base,
        appliedExecutionIds: new Set<string>(),
      } as never,
      execution: makeExecution(),
      eventStore: new InMemoryExecutionEventStore(),
      eventId: "EVT-001",
      recordedAt: "2026-09-28T10:02:00Z",
    });
    expect(state.applied).toBe(true);
  });

  it("persists the execution event only after successful reconciliation", () => {
    const base = makeState();
    const eventStore = new InMemoryExecutionEventStore();

    const reconciliationState = {
      ...base,
      appliedExecutionIds: new Set<string>(),
    } as never;

    expect(() =>
      processExecution({
        state: reconciliationState,
        execution: makeExecution("EXE-001", 11),
        eventStore,
        eventId: "EVT-001",
        recordedAt: "2026-09-28T10:02:00Z",
      }),
    ).toThrow("fillQuantity cannot exceed remaining order quantity");

    expect(eventStore.hasExecution("EXE-001")).toBe(false);
  });

  it("does not apply a previously recorded execution twice", () => {
    const base = makeState();
    const eventStore = new InMemoryExecutionEventStore();
    const execution = makeExecution();

    const first = processExecution({
      ...base,
      state: {
        order: base.order,
        accountPortfolio: base.accountPortfolio,
        appliedExecutionIds: new Set<string>(),
      },
      execution,
      eventStore,
      eventId: "EVT-001",
      recordedAt: "2026-09-28T10:02:00Z",
    });

    const second = processExecution({
      state: first.state,
      execution,
      eventStore,
      eventId: "EVT-002",
      recordedAt: "2026-09-28T10:03:00Z",
    });

    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.state).toBe(first.state);
    expect(eventStore.listByOrderId("ORD-001")).toHaveLength(1);
  });

  it("updates order and portfolio together", () => {
    const base = makeState();
    const result = processExecution({
      state: {
        order: base.order,
        accountPortfolio: base.accountPortfolio,
        appliedExecutionIds: new Set<string>(),
      },
      execution: makeExecution("EXE-001", 4),
      eventStore: new InMemoryExecutionEventStore(),
      eventId: "EVT-001",
      recordedAt: "2026-09-28T10:02:00Z",
    });

    expect(result.state.order.filledQuantity).toBe(4);
    expect(result.state.order.status).toBe("partially_filled");
    expect(result.state.accountPortfolio.portfolio.positions.get("AAPL")?.quantity).toBe(4);
  });
});
