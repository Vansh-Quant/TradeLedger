import { createHash, randomUUID } from "node:crypto";
import { ApplicationError, AuthorizationError, ValidationError } from "./errors.js";
import type { ApplicationPrincipal } from "./contracts.js";

export type MutationStatus = "IN_PROGRESS" | "COMPLETED" | "FAILED";

export interface IdempotencyRecord {
  readonly key: string;
  readonly operation: string;
  readonly accountId: string;
  readonly principalId: string;
  readonly fingerprint: string;
  readonly status: MutationStatus;
  readonly createdAt: string;
  readonly completedAt?: string;
  readonly result?: unknown;
  readonly errorCode?: string;
  readonly errorMessage?: string;
}

export interface MutationIdempotencyPort {
  get(key: string): IdempotencyRecord | undefined;
  create(record: IdempotencyRecord): void;
  complete(key: string, result: unknown, completedAt: string): void;
  fail(key: string, error: ApplicationError, completedAt: string): void;
}

export type AuditEventType =
  | "order.submit.requested"
  | "order.submit.admitted"
  | "order.submit.rejected"
  | "order.cancel.requested"
  | "order.cancel.completed"
  | "authorization.denied"
  | "idempotency.replay"
  | "idempotency.conflict";

export interface AuditEvent {
  readonly id: string;
  readonly type: AuditEventType;
  readonly timestamp: string;
  readonly principalId: string;
  readonly accountId: string;
  readonly operation: string;
  readonly correlationId: string;
  readonly idempotencyKey?: string;
  readonly outcome: "requested" | "completed" | "rejected" | "replayed" | "conflict" | "denied";
  readonly reason?: string;
}

export interface AuditEventPort {
  append(event: AuditEvent): void;
}

const MAX_KEY_LENGTH = 128;
const MAX_FINGERPRINT_BYTES = 16 * 1024;
const SAFE_KEY = /^[A-Za-z0-9._:-]{1,128}$/;
const SAFE_CORRELATION_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export function validateIdempotencyKey(value: string | undefined): string {
  if (value === undefined || !SAFE_KEY.test(value)) {
    throw new ValidationError("Idempotency-Key must be 1-128 ASCII characters: A-Z, a-z, 0-9, ., _, :, -");
  }
  if (value.length > MAX_KEY_LENGTH) throw new ValidationError("Idempotency-Key is too long");
  return value;
}

export function validateCorrelationId(value: string): string {
  if (!SAFE_CORRELATION_ID.test(value)) throw new ValidationError("correlation id is invalid");
  return value;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new ValidationError("mutation payload contains a non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !/(authorization|token|password|secret|private.?key|credential)/i.test(key))
      .sort(([a], [b]) => a.localeCompare(b));
    return "{" + entries.map(([key, entry]) => JSON.stringify(key) + ":" + canonicalize(entry)).join(",") + "}";
  }
  throw new ValidationError("mutation payload contains an unsupported value");
}

export function mutationFingerprint(value: unknown): string {
  const canonical = canonicalize(value);
  if (Buffer.byteLength(canonical, "utf8") > MAX_FINGERPRINT_BYTES) {
    throw new ValidationError("mutation payload is too large to fingerprint");
  }
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function mutationScope(principal: ApplicationPrincipal, accountId: string): string {
  return principal.id + ":" + accountId;
}

export class InMemoryMutationIdempotencyStore implements MutationIdempotencyPort {
  private readonly records = new Map<string, IdempotencyRecord>();

  get(key: string): IdempotencyRecord | undefined {
    return this.records.get(key);
  }

  create(record: IdempotencyRecord): void {
    if (this.records.has(record.key)) throw new ApplicationError("IDEMPOTENCY_CONFLICT", "idempotency key already exists");
    this.records.set(record.key, Object.freeze(record));
  }

  complete(key: string, result: unknown, completedAt: string): void {
    const current = this.records.get(key);
    if (current === undefined) throw new ApplicationError("IDEMPOTENCY_STORAGE_ERROR", "idempotency record was not found");
    this.records.set(key, Object.freeze({ ...current, status: "COMPLETED", completedAt, result }));
  }

  fail(key: string, error: ApplicationError, completedAt: string): void {
    const current = this.records.get(key);
    if (current === undefined) throw new ApplicationError("IDEMPOTENCY_STORAGE_ERROR", "idempotency record was not found");
    this.records.set(key, Object.freeze({
      ...current,
      status: "FAILED",
      completedAt,
      errorCode: error.code,
      errorMessage: error.message,
    }));
  }
}

export class InMemoryAuditEventStore implements AuditEventPort {
  private readonly events: AuditEvent[] = [];

  append(event: AuditEvent): void {
    this.events.push(Object.freeze({ ...event }));
  }

  all(): readonly AuditEvent[] {
    return this.events.slice();
  }
}

export interface MutationExecution {
  readonly key: string;
  readonly operation: string;
  readonly accountId: string;
  readonly principal: ApplicationPrincipal;
  readonly correlationId: string;
  readonly payload: unknown;
}

export class MutationBoundary {
  constructor(
    private readonly idempotency: MutationIdempotencyPort,
    private readonly audit: AuditEventPort,
    private readonly now: () => string,
  ) {}

  authorizationDenied(
    principal: ApplicationPrincipal,
    accountId: string,
    operation: string,
    correlationId: string,
    reason: string,
  ): void {
    this.audit.append({
      id: randomUUID(),
      type: "authorization.denied",
      timestamp: this.now(),
      principalId: principal.id,
      accountId,
      operation,
      correlationId: validateCorrelationId(correlationId),
      outcome: "denied",
      reason,
    });
  }

  execute<T>(input: MutationExecution, handler: () => T): T {
    const key = validateIdempotencyKey(input.key);
    const correlationId = validateCorrelationId(input.correlationId);
    const fingerprint = mutationFingerprint(input.payload);
    const current = this.idempotency.get(key);

    if (current !== undefined) {
      const same = current.operation === input.operation
        && current.accountId === input.accountId
        && current.principalId === input.principal.id
        && current.fingerprint === fingerprint;

      if (!same) {
        this.audit.append(this.event(input, "idempotency.conflict", "conflict", "idempotency key conflicts with an existing request"));
        throw new ApplicationError("IDEMPOTENCY_CONFLICT", "idempotency key conflicts with an existing request");
      }

      if (current.status === "COMPLETED") {
        this.audit.append(this.event(input, "idempotency.replay", "replayed"));
        return current.result as T;
      }

      if (current.status === "IN_PROGRESS") {
        throw new ApplicationError("IDEMPOTENCY_IN_PROGRESS", "idempotency request is already in progress");
      }

      throw new ApplicationError(
        "IDEMPOTENCY_FAILED",
        "previous execution failed; reconcile before retrying this idempotency key",
      );
    }

    this.idempotency.create({
      key,
      operation: input.operation,
      accountId: input.accountId,
      principalId: input.principal.id,
      fingerprint,
      status: "IN_PROGRESS",
      createdAt: this.now(),
    });

    this.audit.append(this.event(input, this.requestedType(input.operation), "requested"));

    try {
      const result = handler();
      this.idempotency.complete(key, result, this.now());
      const admitted = typeof result === "object" && result !== null && "admitted" in result
        ? Boolean((result as { admitted: unknown }).admitted)
        : true;
      this.audit.append(this.event(
        input,
        admitted ? this.completedType(input.operation) : this.rejectedType(input.operation),
        admitted ? "completed" : "rejected",
      ));
      return result;
    } catch (error) {
      const appError = error instanceof ApplicationError
        ? error
        : new ApplicationError("MUTATION_FAILED", "mutation execution failed");
      this.idempotency.fail(key, appError, this.now());
      if (error instanceof AuthorizationError) {
        this.authorizationDenied(input.principal, input.accountId, input.operation, correlationId, error.message);
      }
      throw error;
    }
  }

  private event(
    input: MutationExecution,
    type: AuditEventType,
    outcome: AuditEvent["outcome"],
    reason?: string,
  ): AuditEvent {
    return {
      id: randomUUID(),
      type,
      timestamp: this.now(),
      principalId: input.principal.id,
      accountId: input.accountId,
      operation: input.operation,
      correlationId: validateCorrelationId(input.correlationId),
      idempotencyKey: input.key,
      outcome,
      ...(reason === undefined ? {} : { reason }),
    };
  }

  private requestedType(operation: string): AuditEventType {
    return operation === "order.submit" ? "order.submit.requested" : "order.cancel.requested";
  }

  private completedType(operation: string): AuditEventType {
    return operation === "order.submit" ? "order.submit.admitted" : "order.cancel.completed";
  }

  private rejectedType(operation: string): AuditEventType {
    return "order.submit.rejected";
  }
}
