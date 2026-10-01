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

export interface ExecutionPersistence {
  appendExecutionEvent(event: ExecutionEvent): DurableExecutionRecord;
  listExecutionEntriesAfter(sequence: number): readonly DurableExecutionRecord[];
  saveSnapshot(snapshot: DurableExecutionSnapshot): void;
  loadLatestSnapshot(): DurableExecutionSnapshot | undefined;
  latestSequence(): number;
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

/**
 * Infrastructure persistence boundary for execution history.
 *
 * This interface intentionally does not expose domain mutation operations.
 * A PostgreSQL/event-store adapter can implement it later without changing
 * trading-core reconciliation or recovery rules.
 */
export function validateSnapshot(
  persistence: ExecutionPersistence,
  snapshot: DurableExecutionSnapshot,
): void {
  const sequence = requireNonNegativeInteger(
    snapshot.journalSequence,
    "journalSequence",
  );

  if (snapshot.checkpoint.lastSequence !== sequence) {
    throw new Error("snapshot sequence must match checkpoint sequence");
  }

  if (sequence > persistence.latestSequence()) {
    throw new Error("snapshot sequence cannot exceed journal head");
  }

  requireTimestamp(snapshot.savedAt, "savedAt");
}

export class InMemoryExecutionPersistence implements ExecutionPersistence {
  private readonly entries: DurableExecutionRecord[] = [];
  private readonly byExecutionId = new Map<string, DurableExecutionRecord>();
  private latestSnapshot?: DurableExecutionSnapshot;
  private nextSequence = 1;

  appendExecutionEvent(event: ExecutionEvent): DurableExecutionRecord {
    const existing = this.byExecutionId.get(event.execution.id);

    if (existing !== undefined) {
      if (
        JSON.stringify(existing.entry.execution) !==
        JSON.stringify(event.execution)
      ) {
        throw new Error(
          "execution id already exists with different execution data",
        );
      }
      return existing;
    }

    const entry = Object.freeze({
      ...event,
      sequence: this.nextSequence,
    });

    const record = Object.freeze({ entry });
    this.entries.push(record);
    this.byExecutionId.set(event.execution.id, record);
    this.nextSequence += 1;

    return record;
  }

  listExecutionEntriesAfter(
    sequence: number,
  ): readonly DurableExecutionRecord[] {
    const cursor = requireNonNegativeInteger(sequence, "sequence");
    return Object.freeze(
      this.entries.filter((record) => record.entry.sequence > cursor).slice(),
    );
  }

  saveSnapshot(snapshot: DurableExecutionSnapshot): void {
    validateSnapshot(this, snapshot);
    this.latestSnapshot = Object.freeze({
      checkpoint: snapshot.checkpoint,
      journalSequence: snapshot.journalSequence,
      savedAt: snapshot.savedAt,
    });
  }

  loadLatestSnapshot(): DurableExecutionSnapshot | undefined {
    return this.latestSnapshot;
  }

  latestSequence(): number {
    return this.entries.length === 0
      ? 0
      : this.entries[this.entries.length - 1]!.entry.sequence;
  }
}
