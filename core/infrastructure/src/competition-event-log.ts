import type { CompetitionAuditEvent } from "@tradeledger/domain";
import type { CompetitionEvent } from "@tradeledger/application";
import { DurableSegmentedLog } from "./segmented-log.js";
import { PersistenceError } from "./durable-json-store.js";

function decodeEvent(value: unknown): CompetitionEvent {
  if (value === null || typeof value !== "object") throw new PersistenceError("competition event must be an object");
  return value as CompetitionEvent;
}

function decodeAudit(value: unknown): CompetitionAuditEvent {
  if (value === null || typeof value !== "object") throw new PersistenceError("competition audit event must be an object");
  return value as CompetitionAuditEvent;
}

export interface CompetitionEventLogStatus {
  readonly events: ReturnType<DurableSegmentedLog<CompetitionEvent>["status"]>;
  readonly audit: ReturnType<DurableSegmentedLog<CompetitionAuditEvent>["status"]>;
}

export class DurableCompetitionEventLog {
  private readonly events: DurableSegmentedLog<CompetitionEvent>;
  private readonly audit: DurableSegmentedLog<CompetitionAuditEvent>;

  constructor(rootDirectory: string, segmentMaxBytes = 256 * 1024) {
    this.events = new DurableSegmentedLog({
      rootDirectory,
      name: "events",
      segmentMaxBytes,
      encode: (value) => value,
      decode: decodeEvent,
    });
    this.audit = new DurableSegmentedLog({
      rootDirectory,
      name: "audit",
      segmentMaxBytes,
      encode: (value) => value,
      decode: decodeAudit,
    });
  }

  appendEvent(event: CompetitionEvent): void { this.events.append(event); }
  appendManyEvents(events: readonly CompetitionEvent[]): void { this.events.appendMany(events); }

  appendAudit(event: CompetitionAuditEvent): void {
    this.audit.append({ sequence: event.sequence, ...event });
  }
  appendManyAudit(events: readonly CompetitionAuditEvent[]): void { for (const event of events) this.appendAudit(event); }

  listEventsAfter(sequence: number): readonly CompetitionEvent[] { return this.events.listAfter(sequence); }

  listAuditAfter(sequence: number): readonly CompetitionAuditEvent[] {
    return Object.freeze(this.audit.listAfter(sequence).map((event) => event as CompetitionAuditEvent));
  }

  listEvents(): readonly CompetitionEvent[] { return this.events.listAll(); }

  listAudit(): readonly CompetitionAuditEvent[] {
    return Object.freeze(this.audit.listAll().map((event) => event as CompetitionAuditEvent));
  }

  status(): CompetitionEventLogStatus {
    return Object.freeze({ events: this.events.status(), audit: this.audit.status() });
  }

  compactEventsThrough(sequence: number): void { this.events.compactThrough(sequence); }

  compactAuditThrough(sequence: number): void { this.audit.compactThrough(sequence); }
}
