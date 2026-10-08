import { describe, expect, it } from "vitest";
import { CompetitionApplicationService } from "@tradeledger/application";

const owner = { id: "owner-1", roles: ["owner"] };
const participant = { id: "participant-1", roles: ["participant"] };

function createService() {
  const service = new CompetitionApplicationService();
  service.create({
    principal: owner,
    config: {
      id: "CMP-TEST",
      name: "Competition Test",
      maxParticipants: 1000,
      allowedInstruments: ["AAPL", "MSFT"],
      maxOrderNotional: 50_000,
      maxOrdersPerParticipantPerSecond: 10,
      startingEquity: 100_000,
    },
  });
  return service;
}

describe("competition application service", () => {
  it("creates, registers, prepares and starts a competition", () => {
    const service = createService();
    service.register({ principal: participant, participantId: "P-1", accountId: "CMP-1" });
    const prepared = service.prepare(owner, "prepare-1");
    expect(prepared.competition.state).toBe("ready");

    const started = service.control({
      principal: owner,
      action: "start",
      expectedVersion: prepared.competition.version,
      requestId: "start-1",
    });
    expect(started.applied).toBe(true);
    expect(started.competition.state).toBe("live");
    expect(started.competition.participants[0]?.state).toBe("active");
  });

  it("enforces participant suspension through the control service", () => {
    const service = createService();
    service.register({ principal: participant, participantId: "P-1", accountId: "CMP-1" });
    const prepared = service.prepare(owner, "prepare-1");
    const started = service.control({
      principal: owner,
      action: "start",
      expectedVersion: prepared.competition.version,
      requestId: "start-1",
    });

    const suspended = service.control({
      principal: owner,
      action: "suspend_participant",
      participantId: "P-1",
      expectedVersion: started.competition.version,
      requestId: "suspend-1",
    });
    expect(suspended.applied).toBe(true);
    expect(suspended.competition.participants[0]?.state).toBe("suspended");
  });

  it("rejects stale control requests without mutating state", () => {
    const service = createService();
    service.register({ principal: participant, participantId: "P-1", accountId: "CMP-1" });
    const prepared = service.prepare(owner, "prepare-1");

    const result = service.control({
      principal: owner,
      action: "start",
      expectedVersion: prepared.competition.version - 1,
      requestId: "stale-1",
    });

    expect(result.applied).toBe(false);
    expect(result.reason).toBe("stale competition version");
    expect(result.competition.state).toBe("ready");
  });

  it("blocks a participant from controlling competition state", () => {
    const service = createService();
    service.register({ principal: participant, participantId: "P-1", accountId: "CMP-1" });
    const prepared = service.prepare(owner, "prepare-1");

    expect(() => service.control({
      principal: participant,
      action: "start",
      expectedVersion: prepared.competition.version,
      requestId: "unauthorized-1",
    })).toThrow(/not authorized|missing_capability/);
  });

  it("applies policy versions and authority decisions", () => {
    const service = createService();
    service.register({ principal: participant, participantId: "P-1", accountId: "CMP-1" });
    const prepared = service.prepare(owner, "prepare-1");
    service.control({ principal: owner, action: "start", expectedVersion: prepared.competition.version, requestId: "start-1" });

    const before = service.get(owner);
    const after = service.updatePolicy({ principal: owner, patch: { emergencyHalt: true } });
    expect(after.policy.version).toBe(before.policy.version + 1);

    const decision = service.authorizeOrder({
      principal: owner,
      participantId: "P-1",
      instrumentId: "AAPL",
      orderNotional: 1000,
      second: 1,
    });
    expect(decision.decision.allowed).toBe(false);
    expect(decision.decision.reason).toBe("emergency_halt");
  });
});
