import { describe, expect, it } from "vitest";
import {
  createCompetition,
  registerCompetitionParticipant,
  startCompetition,
  openCompetitionRegistration,
  prepareCompetition,
  createCompetitionEngineState,
  authorizeCompetitionOrderWithState,
} from "@tradeledger/domain";

describe("competition 1,000-participant load profile", () => {
  it("handles 1,000 isolated participants and 10,000 authority decisions", () => {
    let competition = createCompetition({
      id: "CMP-LOAD",
      name: "Competition Load",
      maxParticipants: 1000,
      allowedInstruments: ["AAPL", "MSFT", "NVDA"],
      maxOrderNotional: 50_000,
      maxOrdersPerParticipantPerSecond: 10,
      startingEquity: 100_000,
    }, "2026-10-08T10:00:00Z");
    competition = openCompetitionRegistration(competition);

    for (let i = 0; i < 1000; i += 1) {
      const id = `P-${String(i).padStart(4, "0")}`;
      competition = registerCompetitionParticipant(competition, {
        participantId: id,
        accountId: `ACC-${id}`,
        state: "registered",
        registeredAt: "2026-10-08T10:00:00Z",
      });
    }

    competition = prepareCompetition(competition);
    competition = startCompetition(competition);
    expect(competition.participants).toHaveLength(1000);
    expect(new Set(competition.participants.map((p) => p.accountId)).size).toBe(1000);

    let engine = createCompetitionEngineState(competition);
    let accepted = 0;
    for (let second = 0; second < 10; second += 1) {
      for (let i = 0; i < 1000; i += 1) {
        const result = authorizeCompetitionOrderWithState(engine, {
          participantId: `P-${String(i).padStart(4, "0")}`,
          instrumentId: "AAPL",
          orderNotional: 1000,
          second,
        });
        engine = result.state;
        if (result.decision.allowed) accepted += 1;
      }
    }

    expect(accepted).toBe(10_000);
    expect(Object.keys(engine.orderCounts)).toHaveLength(1000);
    expect(engine.competition.participants.every((p) => p.state === "active")).toBe(true);
  });
});
