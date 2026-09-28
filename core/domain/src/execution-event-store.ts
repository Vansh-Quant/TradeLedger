import type { Execution } from "./execution.js";

export interface ExecutionEvent {
  readonly eventId: string;
  readonly execution: Execution;
  readonly recordedAt: string;
}

export interface ExecutionEventStore {
  append(event: ExecutionEvent): void;
  hasExecution(executionId: string): boolean;
  getByExecutionId(executionId: string): ExecutionEvent | undefined;
  listByOrderId(orderId: string): readonly ExecutionEvent[];
}

function requireNonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new Error(field + " must not be empty");
  return normalized;
}

function requireTimestamp(value: string, field: string): string {
  const normalized = requireNonEmpty(value, field);
  if (!Number.isFinite(Date.parse(normalized))) {
    throw new Error(field + " must be a valid timestamp");
  }
  return normalized;
}

/**
 * Validates the identity envelope around an execution event.
 *
 * The store is deliberately append-only. Persistence is an infrastructure
 * concern; this contract keeps event identity and ordering semantics explicit
 * without coupling the domain to a database.
 */
export function createExecutionEvent(input: {
  readonly eventId: string;
  readonly execution: Execution;
  readonly recordedAt: string;
}): ExecutionEvent {
  return Object.freeze({
    eventId: requireNonEmpty(input.eventId, "eventId"),
    execution: input.execution,
    recordedAt: requireTimestamp(input.recordedAt, "recordedAt"),
  });
}

/**
 * Deterministic in-memory reference implementation.
 *
 * It is intentionally not presented as durable storage. A database/event-log
 * adapter can implement the same contract later without changing reconciliation
 * rules.
 */
export class InMemoryExecutionEventStore implements ExecutionEventStore {
  private readonly events: ExecutionEvent[] = [];
  private readonly byExecutionId = new Map<string, ExecutionEvent>();

  append(event: ExecutionEvent): void {
    const existing = this.byExecutionId.get(event.execution.id);

    if (existing !== undefined) {
      if (
        JSON.stringify(existing.execution) !== JSON.stringify(event.execution)
      ) {
        throw new Error(
          "execution id already exists with different execution data",
        );
      }
      return;
    }

    this.events.push(event);
    this.byExecutionId.set(event.execution.id, event);
  }

  hasExecution(executionId: string): boolean {
    return this.byExecutionId.has(executionId);
  }

  getByExecutionId(executionId: string): ExecutionEvent | undefined {
    return this.byExecutionId.get(executionId);
  }

  listByOrderId(orderId: string): readonly ExecutionEvent[] {
    return Object.freeze(
      this.events
        .filter((event) => event.execution.orderId === orderId)
        .slice(),
    );
  }
}
