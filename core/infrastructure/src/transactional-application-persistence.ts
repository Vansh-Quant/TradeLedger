import { openSync, closeSync, lstatSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  createExecution,
  createExecutionEvent,
  type AccountId,
  type ExecutionEvent,
  type ExecutionEventStore,
  type TradingCoreState,
} from "@tradeledger/domain";
import type {
  ApplicationTransactionPort,
  ApplicationEvent,
  ApplicationEventPort,
  AuditEvent,
  AuditEventPort,
  MutationIdempotencyPort,
  MutationRecord,
  OrderStatePort,
  TradingContext,
  TradingContextPort,
} from "@tradeledger/application";
import { ApplicationError, IdempotencyConflictError, IdempotencyInProgressError } from "@tradeledger/application";
import {
  DurableJsonStore,
  PersistenceError,
  type JsonCodec,
} from "./durable-json-store.js";
import { getOrderStateCodec as orderCodecFactory, getTradingContextCodec as contextCodecFactory } from "./application-adapters.js";

interface ApplicationSnapshot {
  readonly version: 1;
  readonly orders: TradingCoreState[];
  readonly contexts: TradingContext[];
  readonly mutations: MutationRecord[];
  readonly auditEvents: AuditEvent[];
  readonly applicationEvents: ApplicationEvent[];
  readonly executions?: ExecutionEvent[];
}

function objectRecord(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new PersistenceError(field + " must be an object");
  return value as Record<string, unknown>;
}

function nonEmpty(value: unknown, field: string, max = 256): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max || value.trim().length === 0) {
    throw new PersistenceError(field + " is invalid");
  }
  return value;
}

function timestamp(value: unknown, field: string): string {
  const result = nonEmpty(value, field, 64);
  if (!Number.isFinite(Date.parse(result))) throw new PersistenceError(field + " must be a valid timestamp");
  return result;
}

function idempotencyKey(value: unknown, field: string): string {
  const result = nonEmpty(value, field, 128);
  if (!/^[\x21-\x7e]+$/.test(result)) throw new PersistenceError(field + " contains invalid characters");
  return result;
}

function encodeJsonValue(value: unknown): unknown {
  const encoded = JSON.stringify(value, (_, item) => {
    if (item instanceof Set) return { __tradeledger_type: "Set", values: [...item] };
    if (item instanceof Map) return { __tradeledger_type: "Map", entries: [...item.entries()] };
    return item;
  });
  if (encoded === undefined) throw new PersistenceError("mutation.result is not JSON-serializable");
  return JSON.parse(encoded);
}

function decodeJsonValue(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value), (_, item) => {
    if (
      item &&
      typeof item === "object" &&
      ((item.__tradeledger_type === "Set" && Array.isArray(item.values)) ||
        (item.__tradeledger_type === "Map" && Array.isArray(item.entries)))
    ) {
      return item.__tradeledger_type === "Map" ? new Map(item.entries) : new Set(item.values);
    }
    return item;
  });
}

function validateMutation(value: unknown): MutationRecord {
  const raw = objectRecord(value, "mutation");
  const status = nonEmpty(raw.status, "mutation.status", 32);
  if (status !== "in_progress" && status !== "completed" && status !== "failed") throw new PersistenceError("mutation.status is invalid");
  const fingerprint = nonEmpty(raw.fingerprint, "mutation.fingerprint", 64);
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new PersistenceError("mutation.fingerprint is invalid");
  return Object.freeze({
    key: idempotencyKey(raw.key, "mutation.key"),
    operation: nonEmpty(raw.operation, "mutation.operation", 128),
    accountId: nonEmpty(raw.accountId, "mutation.accountId") as AccountId,
    principalId: nonEmpty(raw.principalId, "mutation.principalId"),
    fingerprint,
    status,
    createdAt: timestamp(raw.createdAt, "mutation.createdAt"),
    ...(raw.completedAt === undefined ? {} : { completedAt: timestamp(raw.completedAt, "mutation.completedAt") }),
    ...(raw.result === undefined ? {} : { result: decodeJsonValue(raw.result) }),
    ...(raw.errorCode === undefined ? {} : { errorCode: nonEmpty(raw.errorCode, "mutation.errorCode", 128) }),
  });
}

function validateApplicationEvent(value: unknown): ApplicationEvent {
  const raw = objectRecord(value, "applicationEvent");
  const type = nonEmpty(raw.type, "applicationEvent.type", 64);
  if (!["order.submitted", "order.rejected", "order.cancel.requested", "order.cancelled", "order.expired", "execution.recorded"].includes(type)) throw new PersistenceError("applicationEvent.type is invalid");
  const aggregateType = nonEmpty(raw.aggregateType, "applicationEvent.aggregateType", 32);
  if (aggregateType !== "order" && aggregateType !== "execution") throw new PersistenceError("applicationEvent.aggregateType is invalid");
  if (typeof raw.sequence !== "number" || !Number.isSafeInteger(raw.sequence) || raw.sequence <= 0) throw new PersistenceError("applicationEvent.sequence is invalid");
  const payload = objectRecord(raw.payload, "applicationEvent.payload");
  for (const [key, item] of Object.entries(payload)) {
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(key) || (typeof item !== "string" && typeof item !== "number") || (typeof item === "number" && !Number.isFinite(item))) throw new PersistenceError("applicationEvent.payload is invalid");
  }
  return Object.freeze({
    eventId: nonEmpty(raw.eventId, "applicationEvent.eventId", 128),
    type: type as ApplicationEvent["type"],
    occurredAt: timestamp(raw.occurredAt, "applicationEvent.occurredAt"),
    accountId: nonEmpty(raw.accountId, "applicationEvent.accountId") as AccountId,
    aggregateType: aggregateType as ApplicationEvent["aggregateType"],
    aggregateId: nonEmpty(raw.aggregateId, "applicationEvent.aggregateId", 128),
    requestId: nonEmpty(raw.requestId, "applicationEvent.requestId", 128),
    sequence: raw.sequence as number,
    payload: Object.freeze({ ...payload } as Readonly<Record<string, string | number>>),
  });
}

function validateAudit(value: unknown): AuditEvent {
  const raw = objectRecord(value, "auditEvent");
  const outcome = nonEmpty(raw.outcome, "auditEvent.outcome", 16);
  if (outcome !== "success" && outcome !== "failure" && outcome !== "replay") throw new PersistenceError("auditEvent.outcome is invalid");
  const action = nonEmpty(raw.action, "auditEvent.action", 64);
  if (
    action !== "order.submit" &&
    action !== "order.cancel" &&
    action !== "order.read" &&
    action !== "market-data.read" &&
    action !== "execution.record"
  ) throw new PersistenceError("auditEvent.action is invalid");
  return Object.freeze({
    id: nonEmpty(raw.id, "auditEvent.id", 128),
    type: nonEmpty(raw.type, "auditEvent.type", 128),
    timestamp: timestamp(raw.timestamp, "auditEvent.timestamp"),
    principalId: nonEmpty(raw.principalId, "auditEvent.principalId"),
    accountId: nonEmpty(raw.accountId, "auditEvent.accountId") as AccountId,
    action,
    requestId: nonEmpty(raw.requestId, "auditEvent.requestId", 128),
    ...(raw.idempotencyKey === undefined ? {} : { idempotencyKey: idempotencyKey(raw.idempotencyKey, "auditEvent.idempotencyKey") }),
    outcome,
    ...(raw.reason === undefined ? {} : { reason: nonEmpty(raw.reason, "auditEvent.reason", 256) }),
  });
}

const snapshotCodec: JsonCodec<ApplicationSnapshot> = {
  encode(value) {
    return {
      version: 1,
      orders: value.orders.map((state) => orderCodecFactory().encode(state)),
      contexts: value.contexts.map((context) => contextCodecFactory().encode(context)),
      mutations: value.mutations.map((mutation) => ({
        ...mutation,
        ...(mutation.result === undefined ? {} : { result: encodeJsonValue(mutation.result) }),
      })),
      auditEvents: value.auditEvents,
      applicationEvents: value.applicationEvents,
      executions: value.executions ?? [],
    };
  },
  decode(value) {
    const raw = objectRecord(value, "applicationSnapshot");
    if (raw.version !== 1) throw new PersistenceError("application snapshot version is unsupported");
    if (!Array.isArray(raw.orders) || !Array.isArray(raw.contexts) || !Array.isArray(raw.mutations) || !Array.isArray(raw.auditEvents)) {
      throw new PersistenceError("application snapshot collections are invalid");
    }
    const orders = raw.orders.map((item) => orderCodecFactory().decode(item));
    const contexts = raw.contexts.map((item) => contextCodecFactory().decode(item));
    const mutations = raw.mutations.map(validateMutation);
    const auditEvents = raw.auditEvents.map(validateAudit);
    const rawApplicationEvents = raw.applicationEvents;
    if (rawApplicationEvents !== undefined && !Array.isArray(rawApplicationEvents)) {
      throw new PersistenceError("applicationEvents must be an array");
    }
    const applicationEvents = (rawApplicationEvents ?? []).map(validateApplicationEvent);
    const rawExecutions = raw.executions;
    if (rawExecutions !== undefined && !Array.isArray(rawExecutions)) throw new PersistenceError("executions must be an array");
    const executions = (rawExecutions ?? []).map((item) => {
      const event = objectRecord(item, "executionEvent");
      const executionRaw = objectRecord(event.execution, "executionEvent.execution");
      try {
        return createExecutionEvent({
          eventId: nonEmpty(event.eventId, "executionEvent.eventId", 128),
          recordedAt: timestamp(event.recordedAt, "executionEvent.recordedAt"),
          execution: createExecution({
            id: nonEmpty(executionRaw.id, "execution.id", 128),
            orderId: nonEmpty(executionRaw.orderId, "execution.orderId", 128),
            instrumentId: nonEmpty(executionRaw.instrumentId, "execution.instrumentId", 128) as import("@tradeledger/domain").InstrumentId,
            side: nonEmpty(executionRaw.side, "execution.side", 16) as import("@tradeledger/domain").OrderSide,
            quantity: typeof executionRaw.quantity === "number" ? executionRaw.quantity : Number.NaN,
            price: typeof executionRaw.price === "number" ? executionRaw.price : Number.NaN,
            executedAt: nonEmpty(executionRaw.executedAt, "execution.executedAt", 64),
            commission: typeof executionRaw.commission === "number" ? executionRaw.commission : Number.NaN,
          }),
        });
      } catch (error) {
        throw new PersistenceError("execution event is invalid: " + (error instanceof Error ? error.message : "unknown error"));
      }
    });
    const executionIds = new Set<string>();
    const executionEventIds = new Set<string>();
    for (const event of executions) {
      if (executionIds.has(event.execution.id)) throw new PersistenceError("duplicate persisted execution id");
      if (executionEventIds.has(event.eventId)) throw new PersistenceError("duplicate persisted execution event id");
      executionIds.add(event.execution.id);
      executionEventIds.add(event.eventId);
    }
    const orderIds = new Set<string>();
    for (const state of orders) {
      if (orderIds.has(state.order.id)) throw new PersistenceError("duplicate persisted order id");
      orderIds.add(state.order.id);
    }
    const contextIds = new Set<string>();
    for (const context of contexts) {
      if (contextIds.has(context.accountId)) throw new PersistenceError("duplicate persisted account context");
      contextIds.add(context.accountId);
    }
    const eventIds = new Set<string>();
    let previousSequence = 0;
    for (const event of applicationEvents) {
      if (eventIds.has(event.eventId)) throw new PersistenceError("duplicate persisted application event id");
      if (event.sequence !== previousSequence + 1) throw new PersistenceError("application event sequence is not contiguous");
      eventIds.add(event.eventId);
      previousSequence = event.sequence;
    }
    const mutationKeys = new Set<string>();
    for (const mutation of mutations) {
      if (mutationKeys.has(mutation.key)) throw new PersistenceError("duplicate persisted idempotency key");
      mutationKeys.add(mutation.key);
    }
    return Object.freeze({ version: 1, orders, contexts, mutations, auditEvents, applicationEvents, executions });
  },
};

interface StateCopy {
  orders: Map<string, TradingCoreState>;
  contexts: Map<string, TradingContext>;
  mutations: Map<string, MutationRecord>;
  auditEvents: AuditEvent[];
  applicationEvents: ApplicationEvent[];
  executions: ExecutionEvent[];
}

export class TransactionalApplicationPersistence
  implements ApplicationTransactionPort, OrderStatePort, TradingContextPort, MutationIdempotencyPort, AuditEventPort, ApplicationEventPort, ExecutionEventStore {
  private readonly store: DurableJsonStore<ApplicationSnapshot>;
  private readonly lockPath: string;
  private orders = new Map<string, TradingCoreState>();
  private contexts = new Map<string, TradingContext>();
  private mutations = new Map<string, MutationRecord>();
  private auditEvents: AuditEvent[] = [];
  private applicationEvents: ApplicationEvent[] = [];
  private executions: ExecutionEvent[] = [];
  private readonly subscribers = new Map<string, Set<(event: ApplicationEvent) => void>>();
  private pendingEvents: ApplicationEvent[] = [];
  private inTransaction = false;

  constructor(rootDirectory: string) {
    this.store = new DurableJsonStore(rootDirectory, "application", snapshotCodec);
    this.lockPath = join(rootDirectory, ".application-transaction.lock");
    this.reload();
  }

  execute<T>(operation: () => T): T {
    return this.withLock(() => {
      this.reload();
      const before = this.capture();
      this.inTransaction = true;
      try {
        const result = operation();
        this.persist();
        const committedEvents = this.pendingEvents;
        this.pendingEvents = [];
        for (const event of committedEvents) this.notifySubscribers(event);
        return result;
      } catch (error) {
        this.restore(before);
        this.pendingEvents = [];
        throw error;
      } finally {
        this.inTransaction = false;
      }
    });
  }

  get(orderId: string): TradingCoreState | undefined {
    if (!this.inTransaction) this.reload();
    return this.orders.get(orderId);
  }

  list(accountId: AccountId): readonly TradingCoreState[] {
    if (!this.inTransaction) this.reload();
    return [...this.orders.values()]
      .filter((state) => state.order.accountId === accountId)
      .sort((left, right) => left.order.createdAt.localeCompare(right.order.createdAt));
  }

  save(state: TradingCoreState): void {
    this.orders.set(state.order.id, state);
  }

  getContext(accountId: AccountId): TradingContext {
    if (!this.inTransaction) this.reload();
    const context = this.contexts.get(accountId);
    if (context === undefined) throw new PersistenceError("trading context " + accountId + " was not found");
    return context;
  }

  saveContext(context: TradingContext): void {
    this.contexts.set(context.accountId, context);
  }

  append(event: AuditEvent): void {
    this.auditEvents.push(Object.freeze({ ...event }));
  }

  publish(event: ApplicationEvent): void {
    if (!this.inTransaction) throw new PersistenceError("application events must be published inside a transaction");
    const expected = this.applicationEvents.length + 1;
    if (event.sequence !== expected) throw new PersistenceError("application event sequence is not contiguous");
    if (this.applicationEvents.some((existing) => existing.eventId === event.eventId)) throw new PersistenceError("duplicate application event id");
    const stored = Object.freeze({ ...event, payload: Object.freeze({ ...event.payload }) });
    this.applicationEvents.push(stored);
    this.pendingEvents.push(stored);
  }

  private notifySubscribers(event: ApplicationEvent): void {
    const accountSubscribers = this.subscribers.get(event.accountId);
    if (accountSubscribers === undefined) return;
    for (const subscriber of [...accountSubscribers]) {
      try {
        subscriber(event);
      } catch {
        // Subscribers are transport consumers; a failing consumer must never
        // roll back a committed trading transaction.
      }
    }
  }

  subscribe(accountId: AccountId, subscriber: (event: ApplicationEvent) => void): () => void {
    let accountSubscribers = this.subscribers.get(accountId);
    if (accountSubscribers === undefined) {
      accountSubscribers = new Set();
      this.subscribers.set(accountId, accountSubscribers);
    }
    accountSubscribers.add(subscriber);
    return () => {
      const current = this.subscribers.get(accountId);
      if (current === undefined) return;
      current.delete(subscriber);
      if (current.size === 0) this.subscribers.delete(accountId);
    };
  }

  append(event: ExecutionEvent): void {
    if (!this.inTransaction) throw new PersistenceError("execution events must be appended inside a transaction");
    const byEventId = this.executions.find((existing) => existing.eventId === event.eventId);
    if (byEventId !== undefined) {
      if (JSON.stringify(byEventId) !== JSON.stringify(event)) throw new PersistenceError("execution event id conflicts with existing data");
      return;
    }
    const byExecutionId = this.executions.find((existing) => existing.execution.id === event.execution.id);
    if (byExecutionId !== undefined) {
      if (JSON.stringify(byExecutionId.execution) !== JSON.stringify(event.execution)) throw new PersistenceError("execution id already exists with different execution data");
      return;
    }
    this.executions.push(createExecutionEvent(event));
  }

  hasExecution(executionId: string): boolean {
    if (!this.inTransaction) this.reload();
    return this.executions.some((event) => event.execution.id === executionId);
  }

  getByExecutionId(executionId: string): ExecutionEvent | undefined {
    if (!this.inTransaction) this.reload();
    return this.executions.find((event) => event.execution.id === executionId);
  }

  listByOrderId(orderId: string): readonly ExecutionEvent[] {
    if (!this.inTransaction) this.reload();
    return Object.freeze(this.executions.filter((event) => event.execution.orderId === orderId).slice());
  }

  latestSequence(): number {
    return this.applicationEvents.length;
  }

  listAfterSequence(sequence: number): readonly ApplicationEvent[] {
    if (!this.inTransaction) this.reload();
    if (!Number.isSafeInteger(sequence) || sequence < 0) throw new PersistenceError("sequence must be a non-negative integer");
    return Object.freeze(this.applicationEvents.filter((event) => event.sequence > sequence).slice());
  }

  executeOnce<T>(
    key: string,
    operation: string,
    accountId: AccountId,
    principal: { id: string },
    fingerprint: string,
    run: () => T,
    onReplay?: () => void,
  ): T {
    if (!this.inTransaction) {
      return this.execute(() => this.executeIdempotency(key, operation, accountId, principal, fingerprint, run, onReplay));
    }
    return this.executeIdempotency(key, operation, accountId, principal, fingerprint, run, onReplay);
  }

  private executeIdempotency<T>(
    key: string,
    operation: string,
    accountId: AccountId,
    principal: { id: string },
    fingerprint: string,
    run: () => T,
    onReplay?: () => void,
  ): T {
    const existing = this.mutations.get(key);
    if (existing !== undefined) {
      if (existing.operation !== operation || existing.accountId !== accountId || existing.principalId !== principal.id || existing.fingerprint !== fingerprint) {
        throw new IdempotencyConflictError();
      }
      if (existing.status === "in_progress") throw new IdempotencyInProgressError();
      if (existing.status === "failed") throw new ApplicationError(existing.errorCode ?? "MUTATION_FAILED", "previous mutation failed");
      onReplay?.();
      return existing.result as T;
    }

    this.mutations.set(key, Object.freeze({
      key,
      operation,
      accountId,
      principalId: principal.id,
      fingerprint,
      status: "in_progress",
      createdAt: new Date().toISOString(),
    }));

    try {
      const result = run();
      this.mutations.set(key, Object.freeze({
        ...this.mutations.get(key)!,
        status: "completed",
        completedAt: new Date().toISOString(),
        result,
      }));
      return result;
    } catch (error) {
      this.mutations.set(key, Object.freeze({
        ...this.mutations.get(key)!,
        status: "failed",
        completedAt: new Date().toISOString(),
        errorCode: error instanceof ApplicationError ? error.code : "APPLICATION_ERROR",
      }));
      throw error;
    }
  }

  private reload(): void {
    const snapshot = this.store.get("state");
    this.orders = new Map(snapshot?.orders.map((state) => [state.order.id, state]) ?? []);
    this.contexts = new Map(snapshot?.contexts.map((context) => [context.accountId, context]) ?? []);
    this.mutations = new Map(snapshot?.mutations.map((mutation) => [mutation.key, mutation]) ?? []);
    this.auditEvents = [...(snapshot?.auditEvents ?? [])];
    this.applicationEvents = [...(snapshot?.applicationEvents ?? [])];
    this.executions = [...(snapshot?.executions ?? [])];
  }

  private persist(): void {
    this.store.save("state", {
      version: 1,
      orders: [...this.orders.values()],
      contexts: [...this.contexts.values()],
      mutations: [...this.mutations.values()],
      auditEvents: this.auditEvents,
      applicationEvents: this.applicationEvents,
      executions: this.executions,
    });
  }

  private capture(): StateCopy {
    return {
      orders: new Map(this.orders),
      contexts: new Map(this.contexts),
      mutations: new Map(this.mutations),
      auditEvents: [...this.auditEvents],
      applicationEvents: [...this.applicationEvents],
      executions: [...this.executions],
    };
  }

  private restore(before: StateCopy): void {
    this.orders = before.orders;
    this.contexts = before.contexts;
    this.mutations = before.mutations;
    this.auditEvents = before.auditEvents;
    this.applicationEvents = before.applicationEvents;
    this.executions = before.executions;
  }

  private withLock<T>(operation: () => T): T {
    let descriptor: number;
    try {
      descriptor = openSync(this.lockPath, "wx", 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        this.recoverStaleLock();
        descriptor = openSync(this.lockPath, "wx", 0o600);
      } else {
        throw new PersistenceError("could not acquire application transaction lock");
      }
    }

    try {
      writeFileSync(descriptor, String(process.pid), { encoding: "utf8" });
      return operation();
    } finally {
      closeSync(descriptor);
      rmSync(this.lockPath, { force: true });
    }
  }

  private recoverStaleLock(): void {
    try {
      if (lstatSync(this.lockPath).isSymbolicLink()) throw new PersistenceError("application transaction lock must not be a symbolic link");
    } catch (error) {
      if (error instanceof PersistenceError) throw error;
      throw new PersistenceError("application transaction lock could not be inspected");
    }
    let pid: number;
    try {
      pid = Number.parseInt(readFileSync(this.lockPath, "utf8"), 10);
    } catch {
      throw new PersistenceError("application transaction lock is unreadable");
    }
    if (!Number.isInteger(pid) || pid <= 0) throw new PersistenceError("application transaction lock is invalid");
    try {
      process.kill(pid, 0);
      throw new PersistenceError("application transaction is already in progress");
    } catch (error) {
      if (error instanceof PersistenceError) throw error;
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
        throw new PersistenceError("application transaction lock could not be validated");
      }
      rmSync(this.lockPath, { force: true });
    }
  }
}
