import { describe, expect, it } from "vitest";
import {
  createExecution,
  createExecutionEvent,
  type InstrumentId,
} from "../../core/domain/src/index.js";
import {
  InMemoryExecutionPersistence,
  validateSnapshot,
} from "../../core/infrastructure/src/index.js";

const instrumentId = "AAPL" as InstrumentId;

function execution(id: string, quantity: number) {
  return createExecution({
    id,
    orderId: "ORD-001",
    instrumentId,
    side: "buy",
    quantity,
    price: 100,
    executedAt: "2026-10-01T10:01:00Z",
    commission: 1,
  });
}

function event(id: string, executionId: string, quantity: number) {
  return createExecutionEvent({
    eventId: id,
    execution: execution(executionId, quantity),
    recordedAt: "2026-10-01T10:02:00Z",
  });
}

describe("execution persistence foundation", () => {
  it("appends immutable execution records with monotonic sequences", () => {
    const store = new InMemoryExecutionPersistence();

    const first = store.appendExecutionEvent(event("EVT-001", "EXE-001", 4));
    const second = store.appendExecutionEvent(event("EVT-002", "EXE-002", 6));

    expect(first.entry.sequence).toBe(1);
    expect(second.entry.sequence).toBe(2);
    expect(store.latestSequence()).toBe(2);
  });

  it("keeps duplicate execution IDs idempotent", () => {
    const store = new InMemoryExecutionPersistence();
    const first = store.appendExecutionEvent(event("EVT-001", "EXE-001", 4));
    const duplicate = store.appendExecutionEvent(
      event("EVT-002", "EXE-001", 4),
    );

    expect(duplicate).toBe(first);
    expect(store.latestSequence()).toBe(1);
  });

  it("rejects conflicting reuse of an execution ID", () => {
    const store = new InMemoryExecutionPersistence();
    store.appendExecutionEvent(event("EVT-001", "EXE-001", 4));

    expect(() =>
      store.appendExecutionEvent(event("EVT-002", "EXE-001", 5)),
    ).toThrow("execution id already exists with different execution data");
  });

  it("rejects an event id reused for different event data", () => {
    const store = new InMemoryExecutionPersistence();
    store.appendExecutionEvent(event("EVT-CONFLICT", "EXE-001", 4));
    expect(() => store.appendExecutionEvent(event("EVT-CONFLICT", "EXE-002", 6))).toThrow(
      "event id already exists with different event data",
    );
  });

  it("reads only records after a sequence cursor", () => {
    const store = new InMemoryExecutionPersistence();
    store.appendExecutionEvent(event("EVT-001", "EXE-001", 4));
    store.appendExecutionEvent(event("EVT-002", "EXE-002", 6));

    const records = store.listExecutionEntriesAfter(1);

    expect(records).toHaveLength(1);
    expect(records[0]?.entry.sequence).toBe(2);
  });

  it("saves and loads a recovery snapshot at the journal head", () => {
    const store = new InMemoryExecutionPersistence();
    store.appendExecutionEvent(event("EVT-001", "EXE-001", 4));

    const snapshot = {
      checkpoint: {
        state: {} as never,
        lastSequence: 1,
      },
      journalSequence: 1,
      savedAt: "2026-10-01T10:03:00Z",
    };

    store.saveSnapshot(snapshot);

    expect(store.loadLatestSnapshot()?.journalSequence).toBe(1);
    expect(store.loadLatestSnapshot()?.checkpoint.lastSequence).toBe(1);
  });

  it("rejects a snapshot that is ahead of the journal", () => {
    const store = new InMemoryExecutionPersistence();

    expect(() =>
      validateSnapshot(store, {
        checkpoint: {
          state: {} as never,
          lastSequence: 1,
        },
        journalSequence: 1,
        savedAt: "2026-10-01T10:03:00Z",
      }),
    ).toThrow("snapshot sequence cannot exceed journal head");
  });

  it("rejects a snapshot whose sequence disagrees with its checkpoint", () => {
    const store = new InMemoryExecutionPersistence();
    store.appendExecutionEvent(event("EVT-001", "EXE-001", 4));

    expect(() =>
      validateSnapshot(store, {
        checkpoint: {
          state: {} as never,
          lastSequence: 0,
        },
        journalSequence: 1,
        savedAt: "2026-10-01T10:03:00Z",
      }),
    ).toThrow("snapshot sequence must match checkpoint sequence");
  });
});


  it("commits events and a matching snapshot atomically", () => {
    const store = new InMemoryExecutionPersistence();
    const transaction = store.beginTransaction();

    transaction.appendExecutionEvent(event("EVT-001", "EXE-001", 4));
    transaction.saveSnapshot({
      checkpoint: {
        state: {} as never,
        lastSequence: 1,
      },
      journalSequence: 1,
      savedAt: "2026-10-01T10:03:00Z",
    });
    transaction.commit();

    expect(store.latestSequence()).toBe(1);
    expect(store.loadLatestSnapshot()?.journalSequence).toBe(1);
  });

  it("does not persist staged events when a transaction is rolled back", () => {
    const store = new InMemoryExecutionPersistence();
    const transaction = store.beginTransaction();

    transaction.appendExecutionEvent(event("EVT-001", "EXE-001", 4));
    transaction.rollback();

    expect(store.latestSequence()).toBe(0);
    expect(store.listExecutionEntriesAfter(0)).toHaveLength(0);
  });

  it("rejects snapshots ahead of staged journal state", () => {
    const store = new InMemoryExecutionPersistence();
    const transaction = store.beginTransaction();

    transaction.appendExecutionEvent(event("EVT-001", "EXE-001", 4));

    expect(() =>
      transaction.saveSnapshot({
        checkpoint: {
          state: {} as never,
          lastSequence: 2,
        },
        journalSequence: 2,
        savedAt: "2026-10-01T10:03:00Z",
      }),
    ).toThrow("snapshot sequence cannot exceed journal head");

    transaction.rollback();
  });

  it("prevents nested transactions", () => {
    const store = new InMemoryExecutionPersistence();
    const transaction = store.beginTransaction();

    expect(() => store.beginTransaction()).toThrow(
      "execution persistence transaction already open",
    );

    transaction.rollback();
  });

  it("prevents use after transaction close", () => {
    const store = new InMemoryExecutionPersistence();
    const transaction = store.beginTransaction();
    transaction.rollback();

    expect(() =>
      transaction.appendExecutionEvent(event("EVT-001", "EXE-001", 4)),
    ).toThrow("execution persistence transaction is closed");
  });
