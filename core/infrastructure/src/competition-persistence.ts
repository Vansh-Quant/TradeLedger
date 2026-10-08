import type { CompetitionPersistencePort, CompetitionPersistenceSnapshot } from "@tradeledger/application";
import type { CompetitionEvent } from "@tradeledger/application";
import { DurableJsonStore, PersistenceError, type JsonCodec } from "./durable-json-store.js";
import { mkdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

function objectRecord(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new PersistenceError(field + " must be an object");
  return value as Record<string, unknown>;
}

function nonEmpty(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new PersistenceError(field + " is invalid");
  return value;
}

function integer(value: unknown, field: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) throw new PersistenceError(field + " is invalid");
  return value;
}

function finite(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new PersistenceError(field + " is invalid");
  return value;
}

function validateEvent(value: unknown): CompetitionEvent {
  const raw = objectRecord(value, "competitionEvent");
  const sequence = integer(raw.sequence, "competitionEvent.sequence", 1);
  const payload = objectRecord(raw.payload, "competitionEvent.payload");
  for (const [key, item] of Object.entries(payload)) {
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(key) || (typeof item !== "string" && typeof item !== "number" && typeof item !== "boolean")) {
      throw new PersistenceError("competitionEvent.payload is invalid");
    }
    if (typeof item === "number" && !Number.isFinite(item)) throw new PersistenceError("competitionEvent.payload number is invalid");
  }
  return Object.freeze({
    eventId: nonEmpty(raw.eventId, "competitionEvent.eventId"),
    type: nonEmpty(raw.type, "competitionEvent.type") as CompetitionEvent["type"],
    occurredAt: nonEmpty(raw.occurredAt, "competitionEvent.occurredAt"),
    competitionId: nonEmpty(raw.competitionId, "competitionEvent.competitionId"),
    sequence,
    targetId: nonEmpty(raw.targetId, "competitionEvent.targetId"),
    ...(raw.requestId === undefined ? {} : { requestId: nonEmpty(raw.requestId, "competitionEvent.requestId") }),
    payload: Object.freeze({ ...payload } as Readonly<Record<string, string | number | boolean>>),
  });
}

const codec: JsonCodec<CompetitionPersistenceSnapshot> = {
  encode(value) {
    return {
      version: 1,
      competition: value.competition,
      policy: value.policy,
      engine: value.engine,
      audit: value.audit,
      eventSequence: value.eventSequence,
      events: value.events,
      idempotency: value.idempotency,
    };
  },
  decode(value) {
    const raw = objectRecord(value, "competitionPersistence");
    if (raw.version !== 1) throw new PersistenceError("competition persistence version is unsupported");
    const competition = objectRecord(raw.competition, "competitionPersistence.competition");
    const policy = objectRecord(raw.policy, "competitionPersistence.policy");
    const engine = objectRecord(raw.engine, "competitionPersistence.engine");
    if (!Array.isArray(raw.audit) || !Array.isArray(raw.events)) throw new PersistenceError("competition persistence collections are invalid");
    const eventSequence = integer(raw.eventSequence, "competitionPersistence.eventSequence");
    const events = raw.events.map(validateEvent);
    if (events.length !== eventSequence) throw new PersistenceError("competition event sequence does not match event count");
    for (let index = 0; index < events.length; index += 1) {
      if (events[index]!.sequence !== index + 1) throw new PersistenceError("competition event sequence is not contiguous");
    }
    return Object.freeze({
      competition: competition as unknown as CompetitionPersistenceSnapshot["competition"],
      policy: policy as unknown as CompetitionPersistenceSnapshot["policy"],
      engine: engine as unknown as CompetitionPersistenceSnapshot["engine"],
      audit: Object.freeze(raw.audit as CompetitionPersistenceSnapshot["audit"]),
      eventSequence,
      events: Object.freeze(events),
      idempotency: (raw.idempotency === undefined ? { records: {} } : raw.idempotency) as unknown as CompetitionPersistenceSnapshot["idempotency"],
    });
  },
};

export class DurableCompetitionPersistence implements CompetitionPersistencePort {
  private readonly store: DurableJsonStore<CompetitionPersistenceSnapshot>;
  private readonly rootPath: string;

  constructor(rootDirectory: string) {
    this.rootPath = rootDirectory.trim();
    this.store = new DurableJsonStore(this.rootPath, "competition", codec);
  }

  load(): CompetitionPersistenceSnapshot | undefined {
    return this.store.get("state");
  }

  save(snapshot: CompetitionPersistenceSnapshot): void {
    if (snapshot.events.length !== snapshot.eventSequence) throw new PersistenceError("competition event sequence is invalid");
    this.store.save("state", snapshot);
  }

  withExclusive<T>(operation: () => T): T {
    const directory = join(this.rootPath, "competition");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const lock = join(directory, ".exclusive-lock");
    const deadline = Date.now() + 5000;
    while (true) {
      try {
        mkdirSync(lock);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw new PersistenceError("could not acquire competition lock");
        try {
          if (Date.now() - statSync(lock).mtimeMs > 30_000) rmSync(lock, { recursive: true, force: true });
        } catch { /* retry acquisition */ }
        if (Date.now() >= deadline) throw new PersistenceError("timed out acquiring competition lock");
        const waiter = new Int32Array(new SharedArrayBuffer(4));
        Atomics.wait(waiter, 0, 0, 5);
      }
    }
    try {
      return operation();
    } finally {
      rmSync(lock, { recursive: true, force: true });
    }
  }

  private rootDirectory(): string {
    return this.root;
  }

  private readonly root = (this.store as unknown as { rootDirectory: string }).rootDirectory;
}
