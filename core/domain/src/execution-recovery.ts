import type { ExecutionJournal, ExecutionJournalEntry } from "./execution-journal.js";
import type { ExecutionReconciliation } from "./execution-reconciliation.js";
import { replayExecutionJournal } from "./execution-journal.js";

export type RecoveryStatus = "recovered" | "already_current";

export interface ExecutionRecoveryCheckpoint {
  readonly state: ExecutionReconciliation;
  readonly lastSequence: number;
}

export interface ExecutionRecoveryResult {
  readonly status: RecoveryStatus;
  readonly checkpoint: ExecutionRecoveryCheckpoint;
  readonly processedEntries: readonly ExecutionJournalEntry[];
  readonly appliedExecutionCount: number;
  readonly duplicateExecutionCount: number;
}

function requireSequence(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(field + " must be a non-negative integer");
  }
  return value;
}

/**
 * Validates that a recovery checkpoint can be used against the supplied
 * journal. A checkpoint may point at the current journal head, but never past
 * it.
 */
export function validateRecoveryCheckpoint(
  journal: ExecutionJournal,
  checkpoint: ExecutionRecoveryCheckpoint,
): void {
  const sequence = requireSequence(checkpoint.lastSequence, "lastSequence");

  if (sequence > journal.latestSequence()) {
    throw new Error("checkpoint sequence cannot exceed journal head");
  }
}

/**
 * Captures a recovery checkpoint from a replay result.
 */
export function createRecoveryCheckpoint(
  result: {
    readonly checkpoint: {
      readonly state: ExecutionReconciliation;
      readonly lastSequence: number;
    };
  },
): ExecutionRecoveryCheckpoint {
  return Object.freeze({
    state: result.checkpoint.state,
    lastSequence: requireSequence(
      result.checkpoint.lastSequence,
      "lastSequence",
    ),
  });
}

/**
 * Recovers deterministic trading state from the execution journal.
 *
 * If the checkpoint is already at the journal head, no reconciliation work is
 * repeated. Otherwise only journal entries after the checkpoint are replayed.
 */
export function recoverExecutionState(
  journal: ExecutionJournal,
  initialState: ExecutionReconciliation,
  checkpoint?: ExecutionRecoveryCheckpoint,
): ExecutionRecoveryResult {
  if (checkpoint !== undefined) {
    validateRecoveryCheckpoint(journal, checkpoint);
  }

  const startingSequence = checkpoint?.lastSequence ?? 0;

  if (startingSequence === journal.latestSequence()) {
    return Object.freeze({
      status: "already_current",
      checkpoint: Object.freeze({
        state: checkpoint?.state ?? initialState,
        lastSequence: startingSequence,
      }),
      processedEntries: Object.freeze([]),
      appliedExecutionCount: 0,
      duplicateExecutionCount: 0,
    });
  }

  const result = replayExecutionJournal(
    journal,
    initialState,
    checkpoint,
  );

  const processedEntries = journal.listAfterSequence(startingSequence);

  return Object.freeze({
    status: "recovered",
    checkpoint: createRecoveryCheckpoint(result),
    processedEntries,
    appliedExecutionCount: result.appliedExecutionCount,
    duplicateExecutionCount: result.duplicateExecutionCount,
  });
}
