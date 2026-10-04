import { openSync, closeSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AccountId,
  TradingCoreState,
} from "@tradeledger/domain";
import type {
  ApplicationTransactionPort,
  AuditEvent,
  AuditEventPort,
  MutationIdempotencyPort,
  MutationRecord,
  OrderStatePort,
  TradingContext,
  TradingContextPort,
} from "@tradeledger/application";
import {
  DurableJsonStore,
  PersistenceError,
  getOrderStateCodec,
  getTradingContextCodec,
  type JsonCodec,
} from "./durable-json-store.js";
import { getOrderStateCodec as orderCodecFactory, getTradingContextCodec as contextCodecFactory } from "./application-adapters.js";

interface ApplicationSnapshot {
  readonly version: 1;
  readonly orders: TradingCoreState[];
  readonly contexts: TradingContext[];
  readonly mutations: MutationRecord[];
  readonly auditEvents: AuditEvent[];
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
    ...(raw.result === undefined ? {} : { result: raw.result }),
    ...(raw.errorCode === undefined ? {} : { errorCode: nonEmpty(raw.errorCode, "mutation.errorCode", 128) }),
  });
}

function validateAudit(value: unknown): AuditEvent {
  const raw = objectRecord(value, "auditEvent");
  const outcome = nonEmpty(raw.outcome, "auditEvent.outcome", 16);
  if (outcome !== "success" && outcome !== "failure" && outcome !== "replay") throw new PersistenceError("auditEvent.outcome is invalid");
  const action = nonEmpty(raw.action, "auditEvent.action", 64);
  if (action !== "order.submit" && action !== "order.cancel" && action !== "order.read") throw new PersistenceError("auditEvent.action is invalid");
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
      orders: value.orders,
      contexts: value.contexts,
      mutations: value.mutations,
      auditEvents: value.auditEvents,
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
    const mutationKeys = new Set<string>();
    for (const mutation of mutations) {
      if (mutationKeys.has(mutation.key)) throw new PersistenceError("duplicate persisted idempotency key");
      mutationKeys.add(mutation.key);
    }
    return Object.freeze({ version: 1, orders, contexts, mutations, auditEvents });
  },
};

interface StateCopy {
  orders: Map<string, TradingCoreState>;
  contexts: Map<string, TradingContext>;
  mutations: Map<string, MutationRecord>;
  auditEvents: AuditEvent[];
}

export class TransactionalApplicationPersistence
  implements ApplicationTransactionPort, OrderStatePort, TradingContextPort, MutationIdempotencyPort, AuditEventPort {
  private readonly store: DurableJsonStore<ApplicationSnapshot>;
  private readonly lockPath: string;
  private orders = new Map<string, TradingCoreState>();
  private contexts = new Map<string, TradingContext>();
  private mutations = new Map<string, MutationRecord>();
  private auditEvents: AuditEvent[] = [];
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
        return result;
      } catch (error) {
        this.restore(before);
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

  executeMutation<T>(
    key: string,
    operation: string,
    accountId: AccountId,
    principal: { id: string },
    fingerprint: string,
    run: () => T,
    onReplay?: () => void,
  ): T {
    return this.execute(() => this.executeIdempotency(key, operation, accountId, principal, fingerprint, run, onReplay));
  }

  executeIdempotency<T>(
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
        throw new PersistenceError("idempotency key conflicts with persisted mutation");
      }
      if (existing.status === "in_progress") throw new PersistenceError("persisted mutation is still in progress");
      if (existing.status === "failed") throw new PersistenceError("previous mutation failed");
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
        errorCode: "APPLICATION_ERROR",
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
  }

  private persist(): void {
    this.store.save("state", {
      version: 1,
      orders: [...this.orders.values()],
      contexts: [...this.contexts.values()],
      mutations: [...this.mutations.values()],
      auditEvents: this.auditEvents,
    });
  }

  private capture(): StateCopy {
    return {
      orders: new Map(this.orders),
      contexts: new Map(this.contexts),
      mutations: new Map(this.mutations),
      auditEvents: [...this.auditEvents],
    };
  }

  private restore(before: StateCopy): void {
    this.orders = before.orders;
    this.contexts = before.contexts;
    this.mutations = before.mutations;
    this.auditEvents = before.auditEvents;
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
