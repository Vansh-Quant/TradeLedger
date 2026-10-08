import { describe, expect, it } from "vitest";
import { buildCompetitionLeaderboard, updateCompetitionLeaderboard } from "@tradeledger/domain";

describe("incremental competition leaderboard", () => {
  it("updates one participant without changing deterministic ordering rules", () => {
    const starting = { A: 100_000, B: 100_000, C: 100_000 };
    const initial = buildCompetitionLeaderboard([
      { participantId: "A", startingEquity: starting.A, realizedPnl: 100, unrealizedPnl: 0 },
      { participantId: "B", startingEquity: starting.B, realizedPnl: 200, unrealizedPnl: 0 },
      { participantId: "C", startingEquity: starting.C, realizedPnl: 50, unrealizedPnl: 0 },
    ]);
    const updated = updateCompetitionLeaderboard(initial, {
      participantId: "C",
      startingEquity: starting.C,
      realizedPnl: 300,
      unrealizedPnl: 0,
    }, starting);

    expect(updated.map((entry) => entry.participantId)).toEqual(["C", "B", "A"]);
    expect(updated.map((entry) => entry.rank)).toEqual([1, 2, 3]);
    expect(updated[0]?.returnPct).toBeCloseTo(0.3);
  });
});
