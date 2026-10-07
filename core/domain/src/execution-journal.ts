import type { ExecutionReconciliation } from "./execution-reconciliation.js";
import type { ExecutionEvent } from "./execution-event-store.js";
import { reconcileExecution } from "./execution-reconciliation.js";

export interface ExecutionJournalEntry extends ExecutionEvent {
  readonly sequence: number;
}

export interface ExecutionJournal {
  append(event: ExecutionEvent): ExecutionJournalEntry;
  latestSequence(): number;
  listAfterSequence(sequence: number): readonly ExecutionJournalEntry[];
  getBySequence(sequence: number): ExecutionJournalEntry | undefined;
}

function requireNonNegativeInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(field + " must be a non-negative integer");
  }
  return value;
}

/**
 * Ordered execution history.
 *
 * Sequence numbers are local journal positions, not broker timestamps or
 * globally unique IDs. A future durable adapter can persist the same contract.
 */
export class InMemoryExecutionJournal implements ExecutionJournal {
  private readonly entries: ExecutionJournalEntry[] = [];
  private readonly byExecutionId = new Map<string, ExecutionJournalEntry>();
  private readonly byEventId = new Map<string, ExecutionJournalEntry>();
  private nextSequence = 1;

  append(event: ExecutionEvent): ExecutionJournalEntry {
    const existingEvent = this.byEventId.get(event.eventId);
    if (existingEvent !== undefined) {
      if (JSON.stringify(existingEvent) !== JSON.stringify(event)) {
        throw new Error("event id already exists with different event data");
      }
      return existingEvent;
    }

    const existing = this.byExecutionId.get(event.execution.id);

    if (existing !== undefined) {
      if (
        JSON.stringify(existing.execution) !== JSON.stringify(event.execution)
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

    this.nextSequence += 1;
    this.entries.push(entry);
    this.byExecutionId.set(event.execution.id, entry);
    this.byEventId.set(event.eventId, entry);

    return entry;
  }

  latestSequence(): number {
    return this.entries.length === 0
      ? 0
      : this.entries[this.entries.length - 1]!.sequence;
  }

  listAfterSequence(sequence: number): readonly ExecutionJournalEntry[] {
    const cursor = requireNonNegativeInteger(sequence, "sequence");

    return Object.freeze(
      this.entries.filter((entry) => entry.sequence > cursor).slice(),
    );
  }

  getBySequence(sequence: number): ExecutionJournalEntry | undefined {
    const cursor = requireNonNegativeInteger(sequence, "sequence");
    return this.entries.find((entry) => entry.sequence === cursor);
  }
}

export interface ExecutionReplayCheckpoint {
  readonly state: ExecutionReconciliation;
  readonly lastSequence: number;
}

export interface JournalReplayResult {
  readonly checkpoint: ExecutionReplayCheckpoint;
  readonly appliedExecutionCount: number;
  readonly duplicateExecutionCount: number;
}

/**
 * Replays journal entries after a checkpoint.
 *
 * The checkpoint is a cursor over the ordered journal plus the canonical
 * reconciliation state. No second position/fill calculation is introduced.
 */
export function replayExecutionJournal(
  journal: ExecutionJournal,
  initialState: ExecutionReconciliation,
  checkpoint?: ExecutionReplayCheckpoint,
): JournalReplayResult {
  let state = checkpoint?.state ?? initialState;
  const startingSequence = checkpoint?.lastSequence ?? 0;
  const entries = journal.listAfterSequence(startingSequence);
  let appliedExecutionCount = 0;
  let duplicateExecutionCount = 0;

  for (const entry of entries) {
    const result = reconcileExecution(state, entry.execution);
    state = result.state;

    if (result.applied) {
      appliedExecutionCount += 1;
    }

    if (result.duplicate) {
      duplicateExecutionCount += 1;
    }
  }

  return Object.freeze({
    checkpoint: Object.freeze({
      state,
      lastSequence:
        entries.length === 0
          ? startingSequence
          : entries[entries.length - 1]!.sequence,
    }),
    appliedExecutionCount,
    duplicateExecutionCount,
  });
}
