import { describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DurableSegmentedLog, DurableCompetitionEventLog } from "../../core/infrastructure/src/index.js";

describe("durable segmented logs", () => {
  it("rotates, replays, compacts while preserving the high-water mark", () => {
    const root = mkdtempSync(join(process.cwd(), ".tmp-segmented-log-"));
    try {
      const log = new DurableSegmentedLog<{ sequence: number; value: string }>({
        rootDirectory: root,
        name: "events",
        segmentMaxBytes: 1024,
        encode: (value) => value,
        decode: (value) => value as { sequence: number; value: string },
      });
      for (let sequence = 1; sequence <= 100; sequence += 1) log.append({ sequence, value: "x".repeat(80) });

      const before = log.status();
      expect(before.latestSequence).toBe(100);
      expect(before.segmentCount).toBeGreaterThan(1);
      expect(log.listAfter(95).map((entry) => entry.sequence)).toEqual([96,97,98,99,100]);

      log.compactThrough(80);
      expect(log.firstSequence()).toBeGreaterThan(1);
      expect(log.latestSequence()).toBe(100);

      log.append({ sequence: 101, value: "next" });
      expect(log.latestSequence()).toBe(101);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("persists event and audit streams separately", () => {
    const root = mkdtempSync(join(process.cwd(), ".tmp-competition-log-"));
    try {
      const log = new DurableCompetitionEventLog(root, 1024);
      log.appendEvent({
        eventId: "E-1",
        type: "competition.created",
        occurredAt: "2026-10-08T12:00:00Z",
        competitionId: "CMP-1",
        sequence: 1,
        targetId: "CMP-1",
        payload: {},
      });
      log.appendAudit({
        eventId: "A-1",
        competitionId: "CMP-1",
        sequence: 1,
        occurredAt: "2026-10-08T12:00:00Z",
        principalId: "owner",
        action: "competition_state_change",
        targetId: "CMP-1",
        outcome: "applied",
        reason: "created",
        policyVersion: 1,
      });

      expect(log.listEventsAfter(0)).toHaveLength(1);
      expect(log.listAuditAfter(0)).toHaveLength(1);
      expect(log.status().events.latestSequence).toBe(1);
      expect(log.status().audit.latestSequence).toBe(1);
      expect(readdirSync(join(root, "events")).some((name) => name.endsWith(".log"))).toBe(true);
      expect(readdirSync(join(root, "audit")).some((name) => name.endsWith(".log"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
