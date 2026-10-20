import { describe, expect, it } from "vitest";
import { amount, describeCompetition, DEFAULT_STALE_AFTER_MS } from "@/lib/competition-view";
import type { CompetitionSnapshot } from "@/api/types";

const NOW = Date.parse("2026-10-20T12:00:00Z");

function snapshot(overrides: Partial<CompetitionSnapshot["competition"]> = {}): CompetitionSnapshot {
  return {
    competition: {
      config: {
        id: "CMP-1",
        name: "Test Competition",
        maxParticipants: 100,
        allowedInstruments: ["AAPL", "MSFT"],
        maxOrderNotional: 50_000,
        maxOrdersPerParticipantPerSecond: 10,
        startingEquity: 100_000,
      },
      state: "live",
      participants: [
        { participantId: "P-1", accountId: "ACC-1", state: "active", registeredAt: "2026-10-20T09:00:00Z" },
        { participantId: "P-2", accountId: "ACC-2", state: "suspended", registeredAt: "2026-10-20T09:05:00Z" },
      ],
      version: 7,
      sequence: 18_421,
      ...overrides,
    },
    policy: {
      version: 3,
      tradingEnabled: true,
      emergencyHalt: false,
      allowedInstruments: ["AAPL", "MSFT"],
      maxOrderNotional: 50_000,
      maxOrdersPerParticipantPerSecond: 10,
    },
    leaderboard: [
      { participantId: "P-1", rank: 1, realizedPnl: 500, unrealizedPnl: 120, totalPnl: 620, returnPct: 0.62 },
    ],
    audit: [
      { sequence: 18_421, action: "ORDER_ACCEPTED", targetId: "P-1", outcome: "APPLIED", occurredAt: "2026-10-20T11:59:00Z" },
    ],
  };
}

describe("competition view", () => {
  it("reports CONNECTING with no data instead of inventing participants", () => {
    const view = describeCompetition({ snapshot: null, error: null, lastUpdatedAt: null, now: NOW });

    expect(view.status).toBe("CONNECTING");
    expect(view.participants).toEqual([]);
    expect(view.audit).toEqual([]);
    expect(view.grossPnl).toBeNull();
    expect(view.registered).toBeNull();
  });

  it("reports UNAVAILABLE when the first read fails", () => {
    const view = describeCompetition({ snapshot: null, error: "Cannot reach TradeLedger API", lastUpdatedAt: null, now: NOW });

    expect(view.status).toBe("UNAVAILABLE");
    expect(view.tone).toBe("negative");
    expect(view.participants).toEqual([]);
  });

  it("reports LIVE only for a fresh authoritative snapshot", () => {
    const view = describeCompetition({ snapshot: snapshot(), error: null, lastUpdatedAt: NOW, now: NOW });

    expect(view.status).toBe("LIVE");
    expect(view.registered).toBe(2);
    expect(view.capacity).toBe(100);
    expect(view.active).toBe(1);
    expect(view.policy?.allowedInstruments).toBe(2);
    expect(view.sequence).toBe(18_421);
  });

  it("downgrades to STALE when the last successful read is old", () => {
    const view = describeCompetition({
      snapshot: snapshot(),
      error: null,
      lastUpdatedAt: NOW - DEFAULT_STALE_AFTER_MS - 1,
      now: NOW,
    });

    expect(view.status).toBe("STALE");
    expect(view.stale).toBe(true);
  });

  it("keeps the snapshot but flags STALE when a later read fails", () => {
    const view = describeCompetition({
      snapshot: snapshot(),
      error: "timeout",
      lastUpdatedAt: NOW - DEFAULT_STALE_AFTER_MS - 1,
      now: NOW,
    });

    expect(view.status).toBe("STALE");
    expect(view.participants).toHaveLength(2);
  });

  it("leaves leaderboard values null when the authority does not rank a participant", () => {
    const view = describeCompetition({ snapshot: snapshot(), error: null, lastUpdatedAt: NOW, now: NOW });
    const unranked = view.participants.find((p) => p.id === "P-2");

    expect(unranked).toBeDefined();
    expect(unranked?.rank).toBeNull();
    expect(unranked?.totalPnl).toBeNull();
    expect(unranked?.returnPct).toBeNull();
    expect(unranked?.state).toBe("SUSPENDED");
  });

  it("derives gross P&L from the leaderboard, not a constant", () => {
    const view = describeCompetition({ snapshot: snapshot(), error: null, lastUpdatedAt: NOW, now: NOW });
    expect(view.grossPnl).toBe(620);
  });

  it("maps the authority audit trail verbatim", () => {
    const view = describeCompetition({ snapshot: snapshot(), error: null, lastUpdatedAt: NOW, now: NOW });
    expect(view.audit).toEqual([
      {
        sequence: 18_421,
        action: "ORDER_ACCEPTED",
        target: "P-1",
        outcome: "APPLIED",
        reason: null,
        occurredAt: "2026-10-20T11:59:00Z",
      },
    ]);
  });

  it("formats amounts without asserting a currency", () => {
    expect(amount(620, true)).toBe("+620.00");
    expect(amount(-12.5)).toBe("-12.50");
    expect(amount(null)).toBe("—");
  });
});
