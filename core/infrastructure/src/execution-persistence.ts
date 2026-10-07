import type { ExecutionEvent } from "../../domain/src/execution-event-store.js";
import type { ExecutionJournalEntry } from "../../domain/src/execution-journal.js";
import type { ExecutionRecoveryCheckpoint } from "../../domain/src/execution-recovery.js";

export interface DurableExecutionRecord {
  readonly entry: ExecutionJournalEntry;
}

export interface DurableExecutionSnapshot {
  readonly checkpoint: ExecutionRecoveryCheckpoint;
  readonly journalSequence: number;
  readonly savedAt: string;
}

export interface ExecutionPersistenceTransaction {
  appendExecutionEvent(event: ExecutionEvent): DurableExecutionRecord;
  saveSnapshot(snapshot: DurableExecutionSnapshot): void;
  commit(): void;
  rollback(): void;
}

export interface ExecutionPersistence {
  appendExecutionEvent(event: ExecutionEvent): DurableExecutionRecord;
  listExecutionEntriesAfter(sequence: number): readonly DurableExecutionRecord[];
  saveSnapshot(snapshot: DurableExecutionSnapshot): void;
  loadLatestSnapshot(): DurableExecutionSnapshot | undefined;
  latestSequence(): number;
  beginTransaction(): ExecutionPersistenceTransaction;
}

function requireNonNegativeInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(field + " must be a non-negative integer");
  }
  return value;
}

function requireTimestamp(value: string, field: string): string {
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(field + " must be a valid timestamp");
  }
  return value;
}

function cloneSnapshot(snapshot: DurableExecutionSnapshot): DurableExecutionSnapshot {
  return Object.freeze({
    checkpoint: snapshot.checkpoint,
    journalSequence: snapshot.journalSequence,
    savedAt: snapshot.savedAt,
  });
}

export function validateSnapshot(
  persistence: Pick<ExecutionPersistence, "latestSequence">,
  snapshot: DurableExecutionSnapshot,
  journalHead = persistence.latestSequence(),
): void {
  const sequence = requireNonNegativeInteger(
    snapshot.journalSequence,
    "journalSequence",
  );

  if (snapshot.checkpoint.lastSequence !== sequence) {
    throw new Error("snapshot sequence must match checkpoint sequence");
  }

  if (sequence > journalHead) {
    throw new Error("snapshot sequence cannot exceed journal head");
  }

  requireTimestamp(snapshot.savedAt, "savedAt");
}

/**
 * Infrastructure persistence boundary for execution history.
 *
 * Transactions provide an atomic application boundary for execution records
 * and recovery snapshots. A database adapter can implement the same contract
 * with a real database transaction.
 */
export class InMemoryExecutionPersistence implements ExecutionPersistence {
  private readonly entries: DurableExecutionRecord[] = [];
  private readonly byExecutionId = new Map<string, DurableExecutionRecord>();
  private readonly byEventId = new Map<string, DurableExecutionRecord>();
  private latestSnapshot?: DurableExecutionSnapshot;
  private nextSequence = 1;
  private transactionOpen = false;

  appendExecutionEvent(event: ExecutionEvent): DurableExecutionRecord {
    const existingEvent = this.byEventId.get(event.eventId);
    if (existingEvent !== undefined) {
      if (JSON.stringify({ eventId: existingEvent.entry.eventId, execution: existingEvent.entry.execution, recordedAt: existingEvent.entry.recordedAt }) !== JSON.stringify(event)) {
        throw new Error("event id already exists with different event data");
      }
      return existingEvent;
    }

    const existing = this.byExecutionId.get(event.execution.id);

    if (existing !== undefined) {
      if (JSON.stringify(existing.entry.execution) !== JSON.stringify(event.execution)) {
        throw new Error("execution id already exists with different execution data");
      }
      return existing;
    }

    const entry = Object.freeze({ ...event, sequence: this.nextSequence });
    const record = Object.freeze({ entry });
    this.entries.push(record);
    this.byExecutionId.set(event.execution.id, record);
    this.byEventId.set(event.eventId, record);
    this.nextSequence += 1;
    return record;
  }

  listExecutionEntriesAfter(sequence: number): readonly DurableExecutionRecord[] {
    const cursor = requireNonNegativeInteger(sequence, "sequence");
    return Object.freeze(
      this.entries.filter((record) => record.entry.sequence > cursor).slice(),
    );
  }

  saveSnapshot(snapshot: DurableExecutionSnapshot): void {
    validateSnapshot(this, snapshot);
    this.latestSnapshot = cloneSnapshot(snapshot);
  }

  loadLatestSnapshot(): DurableExecutionSnapshot | undefined {
    return this.latestSnapshot;
  }

  latestSequence(): number {
    return this.entries.length === 0
      ? 0
      : this.entries[this.entries.length - 1]!.entry.sequence;
  }

  beginTransaction(): ExecutionPersistenceTransaction {
    if (this.transactionOpen) {
      throw new Error("execution persistence transaction already open");
    }

    this.transactionOpen = true;
    const staged: ExecutionEvent[] = [];
    let stagedSnapshot: DurableExecutionSnapshot | undefined;
    let closed = false;

    const ensureOpen = (): void => {
      if (closed) throw new Error("execution persistence transaction is closed");
    };

    const transaction: ExecutionPersistenceTransaction = {
      appendExecutionEvent: (event) => {
        ensureOpen();

        const existingEvent = this.byEventId.get(event.eventId);
        if (existingEvent !== undefined) {
          if (JSON.stringify(existingEvent.entry) !== JSON.stringify(event)) {
            throw new Error("event id already exists with different event data");
          }
          return existingEvent;
        }

        const existing = this.byExecutionId.get(event.execution.id);
        if (existing !== undefined) {
          if (JSON.stringify(existing.entry.execution) !== JSON.stringify(event.execution)) {
            throw new Error("execution id already exists with different execution data");
          }
          return existing;
        }

        const stagedEvent = staged.find((candidate) => candidate.eventId === event.eventId);
        if (stagedEvent !== undefined) {
          if (JSON.stringify(stagedEvent) !== JSON.stringify(event)) {
            throw new Error("event id already exists with different event data");
          }
          const stagedEventIndex = staged.findIndex((candidate) => candidate.eventId === event.eventId);
          return Object.freeze({
            entry: Object.freeze({
              ...stagedEvent,
              sequence: this.latestSequence() + stagedEventIndex + 1,
            }),
          });
        }

        const stagedExisting = staged.find(
          (candidate) => candidate.execution.id === event.execution.id,
        );
        if (stagedExisting !== undefined) {
          if (JSON.stringify(stagedExisting.execution) !== JSON.stringify(event.execution)) {
            throw new Error("execution id already exists with different execution data");
          }

          const stagedIndex = staged.findIndex(
            (candidate) => candidate.execution.id === event.execution.id,
          );
          return Object.freeze({
            entry: Object.freeze({
              ...stagedExisting,
              sequence: this.latestSequence() + stagedIndex + 1,
            }),
          });
        }

        staged.push(event);

        return Object.freeze({
          entry: Object.freeze({
            ...event,
            sequence: this.latestSequence() + staged.length,
          }),
        });
      },

      saveSnapshot: (snapshot) => {
        ensureOpen();
        validateSnapshot(this, snapshot, this.latestSequence() + staged.length);
        stagedSnapshot = cloneSnapshot(snapshot);
      },

      commit: () => {
        ensureOpen();

        for (const event of staged) {
          this.appendExecutionEvent(event);
        }

        if (stagedSnapshot !== undefined) {
          validateSnapshot(this, stagedSnapshot);
          this.latestSnapshot = cloneSnapshot(stagedSnapshot);
        }

        closed = true;
        this.transactionOpen = false;
      },

      rollback: () => {
        ensureOpen();
        closed = true;
        this.transactionOpen = false;
      },
    };

    return Object.freeze(transaction);
  }
}
