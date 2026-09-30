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
  recoverExecutionState,
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
    createdAt: "2026-09-30T10:00:00Z",
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
    executedAt: `2026-09-30T10:${minute}:00Z`,
    commission: 1,
  });
}

function append(
  journal: InMemoryExecutionJournal,
  id: string,
  execution: ReturnType<typeof makeExecution>,
) {
  journal.append(
    createExecutionEvent({
      eventId: id,
      execution,
      recordedAt: "2026-09-30T10:30:00Z",
    }),
  );
}

describe("execution recovery workflow", () => {
  it("recovers current state from a journal", () => {
    const journal = new InMemoryExecutionJournal();
    append(journal, "EVT-001", makeExecution("EXE-001", 4, "01"));
    append(journal, "EVT-002", makeExecution("EXE-002", 6, "03"));

    const result = recoverExecutionState(journal, makeState());

    expect(result.status).toBe("recovered");
    expect(result.processedEntries).toHaveLength(2);
    expect(result.appliedExecutionCount).toBe(2);
    expect(result.checkpoint.lastSequence).toBe(2);
    expect(result.checkpoint.state.order.status).toBe("filled");
    expect(result.checkpoint.state.order.filledQuantity).toBe(10);
  });

  it("resumes from a prior checkpoint", () => {
    const firstJournal = new InMemoryExecutionJournal();
    const fullJournal = new InMemoryExecutionJournal();

    append(firstJournal, "EVT-001", makeExecution("EXE-001", 4, "01"));
    append(fullJournal, "EVT-001", makeExecution("EXE-001", 4, "01"));
    append(fullJournal, "EVT-002", makeExecution("EXE-002", 6, "03"));

    const checkpoint = recoverExecutionState(firstJournal, makeState()).checkpoint;
    const resumed = recoverExecutionState(fullJournal, makeState(), checkpoint);

    expect(resumed.status).toBe("recovered");
    expect(resumed.processedEntries).toHaveLength(1);
    expect(resumed.appliedExecutionCount).toBe(1);
    expect(resumed.checkpoint.lastSequence).toBe(2);
    expect(resumed.checkpoint.state.order.filledQuantity).toBe(10);
  });

  it("reports already-current when the checkpoint is at journal head", () => {
    const journal = new InMemoryExecutionJournal();
    append(journal, "EVT-001", makeExecution("EXE-001", 10, "01"));

    const first = recoverExecutionState(journal, makeState());
    const second = recoverExecutionState(
      journal,
      makeState(),
      first.checkpoint,
    );

    expect(second.status).toBe("already_current");
    expect(second.processedEntries).toHaveLength(0);
    expect(second.appliedExecutionCount).toBe(0);
    expect(second.checkpoint.state).toBe(first.checkpoint.state);
  });

  it("rejects a checkpoint beyond the journal head", () => {
    const journal = new InMemoryExecutionJournal();
    append(journal, "EVT-001", makeExecution("EXE-001", 4, "01"));

    const state = makeState();

    expect(() =>
      recoverExecutionState(journal, state, {
        state,
        lastSequence: 2,
      }),
    ).toThrow("checkpoint sequence cannot exceed journal head");
  });

  it("does not mutate the supplied initial state", () => {
    const journal = new InMemoryExecutionJournal();
    append(journal, "EVT-001", makeExecution("EXE-001", 4, "01"));

    const initial = makeState();
    const result = recoverExecutionState(journal, initial);

    expect(initial.order.filledQuantity).toBe(0);
    expect(initial.accountPortfolio.portfolio.positions.size).toBe(0);
    expect(result.checkpoint.state).not.toBe(initial);
  });
});
