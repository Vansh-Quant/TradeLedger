import { describe, expect, it } from "vitest";
import { CompetitionApplicationService, type ApplicationPrincipal } from "@tradeledger/application";

const owner: ApplicationPrincipal = { id: "stress-owner", roles: ["owner"] };

function serviceWithParticipant() {
  const service = new CompetitionApplicationService();
  service.create({
    principal: owner,
    config: {
      id: "CMP-CONCURRENCY",
      name: "Concurrency",
      maxParticipants: 1000,
      allowedInstruments: ["AAPL"],
      maxOrderNotional: 50_000,
      maxOrdersPerParticipantPerSecond: 10,
      startingEquity: 100_000,
    },
  });
  service.register({ principal: owner, participantId: "P-0001", accountId: "CMP-0001" });
  return service;
}

describe("competition command concurrency", () => {
  it("allows exactly one winner for a synchronized start race", async () => {
    const service = serviceWithParticipant();
    const prepared = service.prepare(owner, "prepare-race");
    const results = await Promise.all(
      Array.from({ length: 1000 }, (_, index) =>
        Promise.resolve().then(() => service.control({
          principal: owner,
          action: "start",
          expectedVersion: prepared.competition.version,
          requestId: `start-race-${index}`,
        })),
      ),
    );

    expect(results.filter((result) => result.applied)).toHaveLength(1);
    expect(results.filter((result) => result.reason === "stale competition version")).toHaveLength(999);
    expect(service.get(owner).competition.state).toBe("live");
  });

  it("deduplicates a 1,000-request duplicate storm", async () => {
    const service = serviceWithParticipant();
    const prepared = service.prepare(owner, "prepare-duplicate");
    const request = {
      principal: owner,
      action: "start" as const,
      expectedVersion: prepared.competition.version,
      requestId: "same-start-request",
    };

    const results = await Promise.all(
      Array.from({ length: 1000 }, () => Promise.resolve().then(() => service.control(request))),
    );

    expect(results.filter((result) => result.applied)).toHaveLength(1);
    expect(results.filter((result) => result.reason === "duplicate_request")).toHaveLength(999);
    expect(service.get(owner).competition.version).toBe(prepared.competition.version + 1);
  });
});
