import { describe, expect, it } from "vitest";
import {
  createExecution,
  createExecutionEvent,
  type ExecutionEvent,
  type InstrumentId,
} from "../../core/domain/src/index.js";
import {
  EXECUTION_PERSISTENCE_SCHEMA,
  PostgresExecutionPersistence,
  type SqlClient,
  type SqlQueryResult,
  type SqlTransactionClient,
  type SqlTransactionFactory,
} from "../../core/infrastructure/src/index.js";

const instrumentId = "AAPL" as InstrumentId;

function makeEvent(id: string, quantity = 4): ExecutionEvent {
  return createExecutionEvent({
    eventId: "EVT-" + id,
    execution: createExecution({
      id,
      orderId: "ORD-001",
      instrumentId,
      side: "buy",
      quantity,
      price: 100,
      executedAt: "2026-10-02T10:00:00Z",
      commission: 1,
    }),
    recordedAt: "2026-10-02T10:01:00Z",
  });
}

class FakeSqlClient implements SqlTransactionClient {
  readonly queries: Array<{ text: string; values: readonly unknown[] }> = [];
  readonly events = new Map<string, { sequence: number; event: ExecutionEvent }>();
  readonly snapshots: Array<{
    journal_sequence: number;
    checkpoint: unknown;
    saved_at: string;
  }> = [];
  committed = false;
  rolledBack = false;

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<SqlQueryResult<Row>> {
    this.queries.push({ text, values });

    if (text.includes("WHERE execution_id")) {
      const event = this.events.get(String(values[0]));
      return {
        rows: event === undefined ? [] : [event as unknown as Row],
      };
    }

    if (text.includes("RETURNING sequence, event")) {
      const event = JSON.parse(String(values[1])) as ExecutionEvent;
      const sequence = this.events.size + 1;
      const row = { sequence, event };
      this.events.set(event.execution.id, row);
      return { rows: [row as unknown as Row] };
    }

    if (text.includes("COALESCE(MAX(sequence)")) {
      return { rows: [{ sequence: this.events.size } as Row] };
    }

    if (text.includes("WHERE sequence >")) {
      return {
        rows: [...this.events.values()].filter(
          (event) => event.sequence > Number(values[0]),
        ) as unknown as Row[],
      };
    }

    if (text.includes("ORDER BY journal_sequence")) {
      const row = this.snapshots[this.snapshots.length - 1];
      return { rows: row === undefined ? [] : [row as unknown as Row] };
    }

    if (text.includes("tradeledger_execution_snapshots")) {
      this.snapshots.push({
        journal_sequence: Number(values[0]),
        checkpoint: JSON.parse(String(values[1])),
        saved_at: String(values[2]),
      });
      return { rows: [] };
    }

    return { rows: [] };
  }

  async commit(): Promise<void> {
    this.committed = true;
  }

  async rollback(): Promise<void> {
    this.rolledBack = true;
  }
}

class FakeTransactionFactory implements SqlTransactionFactory {
  constructor(readonly client: FakeSqlClient) {}

  async begin(): Promise<FakeSqlClient> {
    return this.client;
  }
}

describe("database execution persistence adapter", () => {
  it("defines the required PostgreSQL tables and indexes", () => {
    expect(EXECUTION_PERSISTENCE_SCHEMA).toContain(
      "tradeledger_execution_events",
    );
    expect(EXECUTION_PERSISTENCE_SCHEMA).toContain(
      "tradeledger_execution_snapshots",
    );
    expect(EXECUTION_PERSISTENCE_SCHEMA).toContain("BIGSERIAL");
    expect(EXECUTION_PERSISTENCE_SCHEMA).toContain("JSONB");
  });

  it("persists an execution event through an injected SQL client", async () => {
    const client = new FakeSqlClient();
    const persistence = new PostgresExecutionPersistence(
      client,
      new FakeTransactionFactory(client),
    );

    const result = await persistence.appendExecutionEvent(makeEvent("EXE-001"));

    expect(result.entry.sequence).toBe(1);
    expect(result.entry.execution.id).toBe("EXE-001");
    expect(client.committed).toBe(true);
  });

  it("returns an existing execution without duplicating it", async () => {
    const client = new FakeSqlClient();
    const persistence = new PostgresExecutionPersistence(
      client,
      new FakeTransactionFactory(client),
    );

    await persistence.appendExecutionEvent(makeEvent("EXE-001"));
    const duplicate = await persistence.appendExecutionEvent(makeEvent("EXE-001"));

    expect(duplicate.entry.sequence).toBe(1);
    expect(client.events.size).toBe(1);
  });

  it("rejects conflicting execution reuse", async () => {
    const client = new FakeSqlClient();
    const persistence = new PostgresExecutionPersistence(
      client,
      new FakeTransactionFactory(client),
    );

    await persistence.appendExecutionEvent(makeEvent("EXE-001", 4));

    await expect(
      persistence.appendExecutionEvent(makeEvent("EXE-001", 5)),
    ).rejects.toThrow("execution id already exists with different execution data");

    expect(client.rolledBack).toBe(true);
  });

  it("reads journal entries after a sequence cursor", async () => {
    const client = new FakeSqlClient();
    const persistence = new PostgresExecutionPersistence(
      client,
      new FakeTransactionFactory(client),
    );

    await persistence.appendExecutionEvent(makeEvent("EXE-001"));
    await persistence.appendExecutionEvent(makeEvent("EXE-002", 6));

    const entries = await persistence.listExecutionEntriesAfter(1);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.entry.execution.id).toBe("EXE-002");
  });

  it("stores and loads the latest recovery snapshot", async () => {
    const client = new FakeSqlClient();
    const persistence = new PostgresExecutionPersistence(
      client,
      new FakeTransactionFactory(client),
    );

    await persistence.appendExecutionEvent(makeEvent("EXE-001"));
    await persistence.saveSnapshot({
      checkpoint: { state: {} as never, lastSequence: 1 },
      journalSequence: 1,
      savedAt: "2026-10-02T10:02:00Z",
    });

    const snapshot = await persistence.loadLatestSnapshot();

    expect(snapshot?.journalSequence).toBe(1);
    expect(snapshot?.checkpoint.lastSequence).toBe(1);
  });

  it("commits an application transaction", async () => {
    const client = new FakeSqlClient();
    const persistence = new PostgresExecutionPersistence(
      client,
      new FakeTransactionFactory(client),
    );

    const result = await persistence.withTransaction(async (transaction) => {
      return transaction.appendExecutionEvent(makeEvent("EXE-001"));
    });

    expect(result.entry.sequence).toBe(1);
    expect(client.committed).toBe(true);
    expect(client.rolledBack).toBe(false);
  });

  it("rolls back when a transaction operation fails", async () => {
    const client = new FakeSqlClient();
    const persistence = new PostgresExecutionPersistence(
      client,
      new FakeTransactionFactory(client),
    );

    await expect(
      persistence.withTransaction(async (transaction) => {
        await transaction.appendExecutionEvent(makeEvent("EXE-001"));
        throw new Error("simulated transaction failure");
      }),
    ).rejects.toThrow("simulated transaction failure");

    expect(client.rolledBack).toBe(true);
  });
});
