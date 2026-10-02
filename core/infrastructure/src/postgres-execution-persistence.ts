import type { ExecutionEvent } from "../../domain/src/execution-event-store.js";
import type { ExecutionRecoveryCheckpoint } from "../../domain/src/execution-recovery.js";
import type {
  DurableExecutionRecord,
  DurableExecutionSnapshot,
} from "./execution-persistence.js";

export interface SqlQueryResult<Row = unknown> {
  readonly rows: readonly Row[];
}

export interface SqlClient {
  query<Row = unknown>(
    text: string,
    values?: readonly unknown[],
  ): Promise<SqlQueryResult<Row>>;
}

export interface SqlTransactionClient extends SqlClient {
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface SqlTransactionFactory {
  begin(): Promise<SqlTransactionClient>;
}

export interface SqlExecutionPersistence {
  appendExecutionEvent(event: ExecutionEvent): Promise<DurableExecutionRecord>;
  listExecutionEntriesAfter(sequence: number): Promise<readonly DurableExecutionRecord[]>;
  saveSnapshot(snapshot: DurableExecutionSnapshot): Promise<void>;
  loadLatestSnapshot(): Promise<DurableExecutionSnapshot | undefined>;
  latestSequence(): Promise<number>;
  withTransaction<T>(
    operation: (transaction: SqlExecutionTransaction) => Promise<T>,
  ): Promise<T>;
}

export interface SqlExecutionTransaction {
  appendExecutionEvent(event: ExecutionEvent): Promise<DurableExecutionRecord>;
  saveSnapshot(snapshot: DurableExecutionSnapshot): Promise<void>;
}

interface EventRow {
  sequence: number | string;
  event: ExecutionEvent;
}

interface SnapshotRow {
  journal_sequence: number | string;
  checkpoint: ExecutionRecoveryCheckpoint;
  saved_at: string;
}

function toSequence(value: number | string): number {
  const sequence = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new Error("database sequence must be a non-negative safe integer");
  }
  return sequence;
}

function toRecord(row: EventRow): DurableExecutionRecord {
  return Object.freeze({
    entry: Object.freeze({
      ...row.event,
      sequence: toSequence(row.sequence),
    }),
  });
}

function toSnapshot(row: SnapshotRow): DurableExecutionSnapshot {
  return Object.freeze({
    checkpoint: row.checkpoint,
    journalSequence: toSequence(row.journal_sequence),
    savedAt: row.saved_at,
  });
}

/**
 * PostgreSQL-oriented persistence adapter.
 *
 * The driver is injected through the SQL interfaces so the infrastructure
 * layer does not depend directly on a database driver package.
 */
export class PostgresExecutionPersistence implements SqlExecutionPersistence {
  public constructor(
    private readonly client: SqlClient,
    private readonly transactions: SqlTransactionFactory,
  ) {}

  async appendExecutionEvent(event: ExecutionEvent): Promise<DurableExecutionRecord> {
    return this.withTransaction((transaction) =>
      transaction.appendExecutionEvent(event),
    );
  }

  async listExecutionEntriesAfter(
    sequence: number,
  ): Promise<readonly DurableExecutionRecord[]> {
    const result = await this.client.query<EventRow>(
      `SELECT sequence, event
       FROM tradeledger_execution_events
       WHERE sequence > $1
       ORDER BY sequence ASC`,
      [sequence],
    );
    return Object.freeze(result.rows.map(toRecord));
  }

  async saveSnapshot(snapshot: DurableExecutionSnapshot): Promise<void> {
    await this.client.query(
      `INSERT INTO tradeledger_execution_snapshots
         (journal_sequence, checkpoint, saved_at)
       VALUES ($1, $2::jsonb, $3::timestamptz)`,
      [snapshot.journalSequence, JSON.stringify(snapshot.checkpoint), snapshot.savedAt],
    );
  }

  async loadLatestSnapshot(): Promise<DurableExecutionSnapshot | undefined> {
    const result = await this.client.query<SnapshotRow>(
      `SELECT journal_sequence, checkpoint, saved_at
       FROM tradeledger_execution_snapshots
       ORDER BY journal_sequence DESC, id DESC
       LIMIT 1`,
    );
    const row = result.rows[0];
    return row === undefined ? undefined : toSnapshot(row);
  }

  async latestSequence(): Promise<number> {
    const result = await this.client.query<{ sequence: number | string }>(
      `SELECT COALESCE(MAX(sequence), 0) AS sequence
       FROM tradeledger_execution_events`,
    );
    return toSequence(result.rows[0]?.sequence ?? 0);
  }

  async withTransaction<T>(
    operation: (transaction: SqlExecutionTransaction) => Promise<T>,
  ): Promise<T> {
    const client = await this.transactions.begin();
    const transaction: SqlExecutionTransaction = {
      appendExecutionEvent: async (event) => {
        const existing = await client.query<EventRow>(
          `SELECT sequence, event
           FROM tradeledger_execution_events
           WHERE execution_id = $1
           FOR UPDATE`,
          [event.execution.id],
        );
        const existingRow = existing.rows[0];
        if (existingRow !== undefined) {
          if (JSON.stringify(existingRow.event.execution) !== JSON.stringify(event.execution)) {
            throw new Error("execution id already exists with different execution data");
          }
          return toRecord(existingRow);
        }
        const inserted = await client.query<EventRow>(
          `INSERT INTO tradeledger_execution_events
             (execution_id, event, recorded_at)
           VALUES ($1, $2::jsonb, $3::timestamptz)
           RETURNING sequence, event`,
          [event.execution.id, JSON.stringify(event), event.recordedAt],
        );
        const row = inserted.rows[0];
        if (row === undefined) {
          throw new Error("database did not return inserted execution event");
        }
        return toRecord(row);
      },
      saveSnapshot: async (snapshot) => {
        await client.query(
          `INSERT INTO tradeledger_execution_snapshots
             (journal_sequence, checkpoint, saved_at)
           VALUES ($1, $2::jsonb, $3::timestamptz)`,
          [snapshot.journalSequence, JSON.stringify(snapshot.checkpoint), snapshot.savedAt],
        );
      },
    };
    try {
      const result = await operation(transaction);
      await client.commit();
      return result;
    } catch (error) {
      await client.rollback();
      throw error;
    }
  }
}