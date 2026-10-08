import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CompetitionApplicationService } from "@tradeledger/application";
import { DurableCompetitionPersistence } from "@tradeledger/infrastructure";

const owner = { id: "owner", roles: ["owner"] };

function config() {
  return {
    id: "CMP-PERSIST",
    name: "Persistent Competition",
    maxParticipants: 1000,
    allowedInstruments: ["AAPL", "MSFT"],
    maxOrderNotional: 50_000,
    maxOrdersPerParticipantPerSecond: 10,
    startingEquity: 100_000,
  };
}

describe("competition persistence and realtime", () => {
  it("survives service reconstruction without losing state or event sequence", () => {
    const root = mkdtempSync(join(tmpdir(), "tradeledger-competition-"));
    try {
      const persistence = new DurableCompetitionPersistence(root);
      const first = new CompetitionApplicationService(persistence);
      first.create({ principal: owner, config: config(), now: "2026-10-08T12:00:00Z" });
      first.register({ principal: owner, participantId: "P-0001", accountId: "CMP-0001" });
      const before = first.get(owner);

      const second = new CompetitionApplicationService(persistence);
      const after = second.get(owner);

      expect(after.competition.version).toBe(before.competition.version);
      expect(after.competition.participants).toHaveLength(1);
      expect(after.audit).toHaveLength(before.audit.length);
      expect(after.audit.map((event) => event.sequence)).toEqual(before.audit.map((event) => event.sequence));
      expect(after.competition.config.id).toBe("CMP-PERSIST");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("replays backlog and streams new competition events", () => {
    const service = new CompetitionApplicationService();
    service.create({ principal: owner, config: config() });
    service.register({ principal: owner, participantId: "P-0001", accountId: "CMP-0001" });

    const backlog = service.listEventsAfter(owner, 0);
    expect(backlog.map((event) => event.type)).toEqual([
      "competition.created",
      "participant.registered",
    ]);

    const received: number[] = [];
    const unsubscribe = service.subscribeToEvents(owner, (event) => received.push(event.sequence));

    const prepared = service.prepare(owner, "prepare-1");
    service.control({
      principal: owner,
      action: "start",
      expectedVersion: prepared.competition.version,
      requestId: "start-1",
    });

    unsubscribe();

    expect(received).toEqual([3, 4]);
    expect(service.listEventsAfter(owner, 2).map((event) => event.type)).toEqual([
      "competition.prepared",
      "competition.started",
    ]);
  });
});
