import type { LeaderboardEntry, ParticipantPerformance } from "./competition-leaderboard.js";

function total(row: ParticipantPerformance): number {
  return row.realizedPnl + row.unrealizedPnl;
}

function compare(a: ParticipantPerformance, b: ParticipantPerformance): number {
  return total(b) - total(a) || a.participantId.localeCompare(b.participantId);
}

export function updateCompetitionLeaderboard(
  previous: readonly LeaderboardEntry[],
  updated: ParticipantPerformance,
  startingEquityByParticipant: Readonly<Record<string, number>>,
): readonly LeaderboardEntry[] {
  const rows = previous.map((entry) => ({
    participantId: entry.participantId,
    startingEquity: startingEquityByParticipant[entry.participantId] ?? 0,
    realizedPnl: entry.realizedPnl,
    unrealizedPnl: entry.unrealizedPnl,
  }));
  const existing = rows.findIndex((row) => row.participantId === updated.participantId);
  if (existing >= 0) rows.splice(existing, 1);
  rows.push(updated);
  rows.sort(compare);
  return Object.freeze(rows.map((row, index) => Object.freeze({
    participantId: row.participantId,
    rank: index + 1,
    realizedPnl: row.realizedPnl,
    unrealizedPnl: row.unrealizedPnl,
    totalPnl: total(row),
    returnPct: total(row) / row.startingEquity * 100,
  })));
}
