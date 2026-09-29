import type { ExecutionEventStore } from "./execution-event-store.js";
import { createExecutionEvent } from "./execution-event-store.js";
import type { Execution } from "./execution.js";
import {
  reconcileExecution,
  type ExecutionReconciliation,
} from "./execution-reconciliation.js";

export interface ProcessExecutionInput {
  readonly state: ExecutionReconciliation;
  readonly execution: Execution;
  readonly eventStore: ExecutionEventStore;
  readonly eventId: string;
  readonly recordedAt: string;
}

export interface ProcessExecutionResult {
  readonly state: ExecutionReconciliation;
  readonly applied: boolean;
  readonly duplicate: boolean;
}

/**
 * Coordinates event recording with the canonical reconciliation workflow.
 *
 * The event is validated and reconciled before it is appended. Duplicate
 * execution IDs are ignored using the event-store identity index. Durable
 * atomicity/transactions belong to the eventual persistence adapter.
 */
export function processExecution(
  input: ProcessExecutionInput,
): ProcessExecutionResult {
  if (input.eventStore.hasExecution(input.execution.id)) {
    return Object.freeze({
      state: input.state,
      applied: false,
      duplicate: true,
    });
  }

  const reconciliation = reconcileExecution(input.state, input.execution);

  if (!reconciliation.applied) {
    return Object.freeze({
      state: reconciliation.state,
      applied: false,
      duplicate: reconciliation.duplicate,
    });
  }

  input.eventStore.append(
    createExecutionEvent({
      eventId: input.eventId,
      execution: input.execution,
      recordedAt: input.recordedAt,
    }),
  );

  return Object.freeze({
    state: reconciliation.state,
    applied: true,
    duplicate: false,
  });
}
