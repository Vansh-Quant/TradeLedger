import { describe, expect, it } from "vitest";
import {
  InMemoryExecutionEventStore,
  createAccount,
  createAccountPortfolio,
  createExecution,
  createExecutionEvent,
  createOrder,
  createPortfolio,
  replayExecutions,
  type InstrumentId,
} from "../../core/domain/src/index.js";

const account = createAccount({ id: "ACC-001", baseCurrency: "USD" });
const instrumentId = "AAPL" as InstrumentId;

function makeOrder() {
  return createOrder({
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
}

function makeExecution(id: string, quantity: number, minute: string) {
  return createExecution({
    id,
    orderId: "ORD-001",
    instrumentId,
    side: "buy",
    quantity,
    price: 100,
    executedAt: `2026-09-28T10:${minute}:00Z`,
    commission: 1,
  });
}

describe("execution event store", () => {
  it("creates an immutable event envelope", () => {
    const execution = makeExecution("EXE-001", 4, "01");
    const event = createExecutionEvent({
      eventId: "EVT-001",
      execution,
      recordedAt: "2026-09-28T10:02:00Z",
    });

    expect(event.eventId).toBe("EVT-001");
    expect(event.execution).toBe(execution);
    expect(Object.isFrozen(event)).toBe(true);
  });

  it("rejects invalid event identity and timestamps", () => {
    const execution = makeExecution("EXE-001", 4, "01");

    expect(() =>
      createExecutionEvent({
        eventId: " ",
        execution,
        recordedAt: "2026-09-28T10:02:00Z",
      }),
    ).toThrow("eventId must not be empty");

    expect(() =>
      createExecutionEvent({
        eventId: "EVT-001",
        execution,
        recordedAt: "not-a-date",
      }),
    ).toThrow("recordedAt must be a valid timestamp");
  });

  it("appends events and indexes them by execution and order", () => {
    const store = new InMemoryExecutionEventStore();
    const first = createExecutionEvent({
      eventId: "EVT-001",
      execution: makeExecution("EXE-001", 4, "01"),
      recordedAt: "2026-09-28T10:02:00Z",
    });
    const second = createExecutionEvent({
      eventId: "EVT-002",
      execution: makeExecution("EXE-002", 6, "03"),
      recordedAt: "2026-09-28T10:04:00Z",
    });

    store.append(first);
    store.append(second);

    expect(store.hasExecution("EXE-001")).toBe(true);
    expect(store.getByExecutionId("EXE-002")).toBe(second);
    expect(store.listByOrderId("ORD-001").map((event) => event.eventId)).toEqual([
      "EVT-001",
      "EVT-002",
    ]);
  });

  it("makes duplicate execution delivery idempotent", () => {
    const store = new InMemoryExecutionEventStore();
    const event = createExecutionEvent({
      eventId: "EVT-001",
      execution: makeExecution("EXE-001", 4, "01"),
      recordedAt: "2026-09-28T10:02:00Z",
    });

    store.append(event);
    store.append(event);

    expect(store.listByOrderId("ORD-001")).toHaveLength(1);
  });

  it("rejects an event id reused for different event data", () => {
    const store = new InMemoryExecutionEventStore();
    store.append(createExecutionEvent({
      eventId: "EVT-CONFLICT",
      execution: makeExecution("EXE-001", 4, "01"),
      recordedAt: "2026-09-28T10:02:00Z",
    }));
    expect(() => store.append(createExecutionEvent({
      eventId: "EVT-CONFLICT",
      execution: makeExecution("EXE-002", 6, "03"),
      recordedAt: "2026-09-28T10:04:00Z",
    }))).toThrow("event id already exists with different event data");
  });

  it("rejects an execution id reused for different execution data", () => {
    const store = new InMemoryExecutionEventStore();
    store.append(
      createExecutionEvent({
        eventId: "EVT-001",
        execution: makeExecution("EXE-001", 4, "01"),
        recordedAt: "2026-09-28T10:02:00Z",
      }),
    );

    expect(() =>
      store.append(
        createExecutionEvent({
          eventId: "EVT-002",
          execution: makeExecution("EXE-001", 5, "02"),
          recordedAt: "2026-09-28T10:03:00Z",
        }),
      ),
    ).toThrow("execution id already exists with different execution data");
  });
});

describe("execution replay", () => {
  it("rebuilds the same order and portfolio state from executions", () => {
    const result = replayExecutions({
      order: Object.freeze({ ...makeOrder(), status: "acknowledged" as const }),
      accountPortfolio: createAccountPortfolio(account, createPortfolio()),
      executions: [
        makeExecution("EXE-001", 4, "01"),
        makeExecution("EXE-002", 6, "03"),
      ],
    });

    expect(result.appliedExecutionCount).toBe(2);
    expect(result.duplicateExecutionCount).toBe(0);
    expect(result.state.order.status).toBe("filled");
    expect(result.state.order.filledQuantity).toBe(10);
    expect(result.state.accountPortfolio.portfolio.positions.get("AAPL")?.quantity).toBe(10);
  });

  it("uses reconciliation idempotency during replay", () => {
    const execution = makeExecution("EXE-001", 4, "01");
    const result = replayExecutions({
      order: Object.freeze({ ...makeOrder(), status: "acknowledged" as const }),
      accountPortfolio: createAccountPortfolio(account, createPortfolio()),
      executions: [execution, execution],
    });

    expect(result.appliedExecutionCount).toBe(1);
    expect(result.duplicateExecutionCount).toBe(1);
    expect(result.state.order.filledQuantity).toBe(4);
    expect(result.state.accountPortfolio.portfolio.positions.get("AAPL")?.quantity).toBe(4);
  });

  it("preserves execution order during replay", () => {
    const store = new InMemoryExecutionEventStore();
    const executions = [
      makeExecution("EXE-001", 4, "01"),
      makeExecution("EXE-002", 3, "03"),
      makeExecution("EXE-003", 3, "05"),
    ];

    for (const [index, execution] of executions.entries()) {
      store.append(
        createExecutionEvent({
          eventId: `EVT-${index + 1}`,
          execution,
          recordedAt: `2026-09-28T10:${String(index + 2).padStart(2, "0")}:00Z`,
        }),
      );
    }

    const result = replayExecutions({
      order: Object.freeze({ ...makeOrder(), status: "acknowledged" as const }),
      accountPortfolio: createAccountPortfolio(account, createPortfolio()),
      executions: store.listByOrderId("ORD-001").map((event) => event.execution),
    });

    expect(result.state.order.filledQuantity).toBe(10);
    expect(result.state.appliedExecutionIds).toEqual(
      new Set(["EXE-001", "EXE-002", "EXE-003"]),
    );
  });
});
