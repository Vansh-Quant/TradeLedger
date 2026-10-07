import { describe, expect, it } from "vitest";
import {
  InMemoryExecutionJournal,
  createAccount,
  createAccountPortfolio,
  createExecution,
  createExecutionEvent,
  createExecutionReconciliation,
  createOrder,
  createPortfolio,
  replayExecutionJournal,
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
    createdAt: "2026-09-29T10:00:00Z",
  });

  return createExecutionReconciliation(
    Object.freeze({ ...order, status: "acknowledged" as const }),
    createAccountPortfolio(account, createPortfolio()),
  );
}

function makeExecution(id: string, quantity: number, minute: string) {
  return createExecution({
    id,
    orderId: "ORD-001",
    instrumentId,
    side: "buy",
    quantity,
    price: 100,
    executedAt: `2026-09-29T10:${minute}:00Z`,
    commission: 1,
  });
}

function makeEvent(id: string, execution: ReturnType<typeof makeExecution>) {
  return createExecutionEvent({
    eventId: id,
    execution,
    recordedAt: "2026-09-29T10:20:00Z",
  });
}

describe("execution journal", () => {
  it("assigns monotonically increasing local sequence numbers", () => {
    const journal = new InMemoryExecutionJournal();
    const first = journal.append(makeEvent("EVT-001", makeExecution("EXE-001", 4, "01")));
    const second = journal.append(makeEvent("EVT-002", makeExecution("EXE-002", 6, "03")));

    expect(first.sequence).toBe(1);
    expect(second.sequence).toBe(2);
    expect(journal.latestSequence()).toBe(2);
  });

  it("is idempotent for the same execution", () => {
    const journal = new InMemoryExecutionJournal();
    const event = makeEvent("EVT-001", makeExecution("EXE-001", 4, "01"));

    const first = journal.append(event);
    const second = journal.append(event);

    expect(second).toBe(first);
    expect(journal.latestSequence()).toBe(1);
  });

  it("rejects conflicting reuse of an execution id", () => {
    const journal = new InMemoryExecutionJournal();

    journal.append(makeEvent("EVT-001", makeExecution("EXE-001", 4, "01")));

    expect(() =>
      journal.append(makeEvent("EVT-002", makeExecution("EXE-001", 5, "02"))),
    ).toThrow("execution id already exists with different execution data");
  });

  it("rejects an event id reused for different event data", () => {
    const journal = new InMemoryExecutionJournal();
    journal.append(makeEvent("EVT-CONFLICT", makeExecution("EXE-001", 4, "01")));
    expect(() => journal.append(makeEvent("EVT-CONFLICT", makeExecution("EXE-002", 6, "03")))).toThrow(
      "event id already exists with different event data",
    );
  });

  it("returns only entries after a checkpoint sequence", () => {
    const journal = new InMemoryExecutionJournal();

    journal.append(makeEvent("EVT-001", makeExecution("EXE-001", 2, "01")));
    journal.append(makeEvent("EVT-002", makeExecution("EXE-002", 3, "02")));
    journal.append(makeEvent("EVT-003", makeExecution("EXE-003", 5, "03")));

    expect(journal.listAfterSequence(1).map((entry) => entry.sequence)).toEqual([2, 3]);
    expect(journal.getBySequence(2)?.execution.id).toBe("EXE-002");
  });

  it("rejects invalid sequence cursors", () => {
    const journal = new InMemoryExecutionJournal();

    expect(() => journal.listAfterSequence(-1)).toThrow("sequence must be a non-negative integer");
    expect(() => journal.getBySequence(1.5)).toThrow("sequence must be a non-negative integer");
  });
});

describe("journal replay checkpoints", () => {
  it("replays the full journal deterministically", () => {
    const journal = new InMemoryExecutionJournal();

    journal.append(makeEvent("EVT-001", makeExecution("EXE-001", 4, "01")));
    journal.append(makeEvent("EVT-002", makeExecution("EXE-002", 6, "03")));

    const result = replayExecutionJournal(journal, makeState());

    expect(result.appliedExecutionCount).toBe(2);
    expect(result.checkpoint.lastSequence).toBe(2);
    expect(result.checkpoint.state.order.filledQuantity).toBe(10);
    expect(result.checkpoint.state.order.status).toBe("filled");
    expect(result.checkpoint.state.accountPortfolio.portfolio.positions.get("AAPL")?.quantity).toBe(10);
  });

  it("can resume replay from a checkpoint", () => {
    const firstJournal = new InMemoryExecutionJournal();
    const fullJournal = new InMemoryExecutionJournal();

    const firstEvent = makeEvent("EVT-001", makeExecution("EXE-001", 4, "01"));
    const secondEvent = makeEvent("EVT-002", makeExecution("EXE-002", 6, "03"));

    firstJournal.append(firstEvent);
    fullJournal.append(firstEvent);
    fullJournal.append(secondEvent);

    const checkpoint = replayExecutionJournal(firstJournal, makeState()).checkpoint;
    const resumed = replayExecutionJournal(fullJournal, makeState(), checkpoint);

    expect(checkpoint.lastSequence).toBe(1);
    expect(checkpoint.state.order.filledQuantity).toBe(4);
    expect(resumed.appliedExecutionCount).toBe(1);
    expect(resumed.checkpoint.lastSequence).toBe(2);
    expect(resumed.checkpoint.state.order.filledQuantity).toBe(10);
    expect(resumed.checkpoint.state.order.status).toBe("filled");
  });

  it("does not replay entries before the checkpoint", () => {
    const journal = new InMemoryExecutionJournal();

    journal.append(makeEvent("EVT-001", makeExecution("EXE-001", 4, "01")));
    journal.append(makeEvent("EVT-002", makeExecution("EXE-002", 6, "03")));

    const full = replayExecutionJournal(journal, makeState());
    const resumed = replayExecutionJournal(journal, full.checkpoint.state, full.checkpoint);

    expect(resumed.appliedExecutionCount).toBe(0);
    expect(resumed.duplicateExecutionCount).toBe(0);
    expect(resumed.checkpoint.lastSequence).toBe(2);
    expect(resumed.checkpoint.state).toBe(full.checkpoint.state);
  });
});
