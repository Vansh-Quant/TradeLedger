import { createHash } from "node:crypto";
import type {
  AccountId,
  TradingCoreState,
} from "@tradeledger/domain";
import type {
  AuditEvent,
  AuditEventPort,\n  ApplicationEvent,\n  ApplicationEventPort,
  ApplicationTransactionPort,
  AuthorizationPort,
  ApplicationAction,
  ApplicationPrincipal,
  MutationIdempotencyPort,
  MutationRecord,
  OrderIdGenerator,
  OrderStatePort,
} from "./contracts.js";
import { ApplicationError, AuthorizationError, ValidationError } from "./errors.js";

export class InMemoryOrderStateStore implements OrderStatePort {
  private readonly states = new Map<string, TradingCoreState>();

  save(state: TradingCoreState): void {
    this.states.set(state.order.id, state);
  }

  get(orderId: string): TradingCoreState | undefined {
    return this.states.get(orderId);
  }

  list(accountId: AccountId): readonly TradingCoreState[] {
    return Object.freeze(
      [...this.states.values()]
        .filter((state) => state.order.accountId === accountId)
        .sort((a, b) => a.order.createdAt.localeCompare(b.order.createdAt)),
    );
  }
}

export class RandomOrderIdGenerator implements OrderIdGenerator {
  next(): string {
    return crypto.randomUUID();
  }
}

export class AllowListedAuthorization implements AuthorizationPort {
  private readonly permissions: ReadonlySet<string>;

  constructor(permissions: readonly string[]) {
    this.permissions = new Set(permissions);
  }

  authorize(
    principal: ApplicationPrincipal,
    action: ApplicationAction,
    accountId: AccountId,
  ): void {
    const keys = [
      `${principal.id}:${action}:${accountId}`,
      `role:${action}`,
      `role:${action}:${accountId}`,
    ];

    if (!keys.some((key) => this.permissions.has(key))) {
      throw new AuthorizationError(
        `principal ${principal.id} is not authorized for ${action}`,
      );
    }
  }
}

export function mutationFingerprint(value: unknown): string {
  const canonical = JSON.stringify(value, (_, item) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      return Object.fromEntries(
        Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
      );
    }
    return item;
  });

  if (canonical === undefined || Buffer.byteLength(canonical, "utf8") > 32 * 1024) {
    throw new ValidationError("mutation payload is invalid or too large");
  }

  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export class IdempotencyConflictError extends ApplicationError {
  constructor() {
    super("IDEMPOTENCY_CONFLICT", "idempotency key conflicts with an existing mutation");
    this.name = "IdempotencyConflictError";
  }
}

export class IdempotencyInProgressError extends ApplicationError {
  constructor() {
    super("IDEMPOTENCY_IN_PROGRESS", "mutation with this idempotency key is in progress");
    this.name = "IdempotencyInProgressError";
  }
}

export class InMemoryMutationIdempotency implements MutationIdempotencyPort {
  private readonly records = new Map<string, MutationRecord>();

  executeOnce<T>(
    key: string,
    operation: string,
    accountId: AccountId,
    principal: ApplicationPrincipal,
    fingerprint: string,
    operationFn: () => T,
    onReplay?: () => void,
  ): T {
    const existing = this.records.get(key);
    if (existing !== undefined) {
      if (
        existing.operation !== operation ||
        existing.accountId !== accountId ||
        existing.principalId !== principal.id ||
        existing.fingerprint !== fingerprint
      ) {
        throw new IdempotencyConflictError();
      }
      if (existing.status === "in_progress") throw new IdempotencyInProgressError();
      if (existing.status === "failed") {
        throw new ApplicationError(
          existing.errorCode ?? "MUTATION_FAILED",
          "previous mutation failed",
        );
      }
      onReplay?.();
      return existing.result as T;
    }

    this.records.set(key, {
      key,
      operation,
      accountId,
      principalId: principal.id,
      fingerprint,
      status: "in_progress",
      createdAt: new Date().toISOString(),
    });

    try {
      const result = operationFn();
      this.records.set(key, {
        ...this.records.get(key)!,
        status: "completed",
        completedAt: new Date().toISOString(),
        result,
      });
      return result;
    } catch (error) {
      this.records.set(key, {
        ...this.records.get(key)!,
        status: "failed",
        completedAt: new Date().toISOString(),
        errorCode: error instanceof ApplicationError ? error.code : "MUTATION_FAILED",
      });
      throw error;
    }
  }
}

export class InMemoryAuditEventStore implements AuditEventPort {
  readonly events: AuditEvent[] = [];

  append(event: AuditEvent): void {
    this.events.push(Object.freeze({ ...event }));
  }
}


export class InMemoryApplicationTransaction implements ApplicationTransactionPort {
  execute<T>(operation: () => T): T {
    return operation();
  }
}


export class InMemoryApplicationEventBus implements ApplicationEventPort {
  private readonly events: ApplicationEvent[] = [];
  private readonly subscribers = new Set<(event: ApplicationEvent) => void>();

  publish(event: ApplicationEvent): void {
    this.events.push(Object.freeze({ ...event, payload: Object.freeze({ ...event.payload }) }));
    for (const subscriber of this.subscribers) subscriber(event);
  }

  subscribe(subscriber: (event: ApplicationEvent) => void): () => void {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  listAfterSequence(sequence: number): readonly ApplicationEvent[] {
    if (!Number.isInteger(sequence) || sequence < 0) throw new ValidationError("sequence must be a non-negative integer");
    return Object.freeze(this.events.filter((event) => event.sequence > sequence).slice());
  }

  latestSequence(): number {
    return this.events.length === 0 ? 0 : this.events[this.events.length - 1]!.sequence;
  }
}
