import { describe, expect, it } from "vitest";
import { analyzeJournal } from "../lib/journal-analytics";
import type { JournalEntry } from "../lib/journal-store";

const trade = (overrides: Partial<JournalEntry> = {}): JournalEntry => ({
  id: "t-1", date: "2026-10-01", symbol: "XAUUSD", side: "LONG", setup: "Sweep",
  session: "London", entryPrice: 100, exitPrice: 110, stopLoss: 95, quantity: 1,
  pnl: 10, rMultiple: 2, outcome: "WIN", higherTimeframeBias: "Bullish", liquidityTarget: "PDH",
  confluence: [], emotion: "Calm", executionQuality: "Good", mistake: "", ruleAdherence: "Followed",
  thesis: "", notes: "", reflection: "", createdAt: "2026-10-01T10:00:00.000Z", updatedAt: "2026-10-01T10:00:00.000Z",
  ...overrides,
});

describe("journal performance analytics", () => {
  it("calculates profit factor, expectancy, payoff and R without counting open trades", () => {
    const result = analyzeJournal([
      trade({ id: "w1", pnl: 100, rMultiple: 2 }),
      trade({ id: "l1", outcome: "LOSS", pnl: -50, rMultiple: -1, setup: "Breakout" }),
      trade({ id: "be1", outcome: "BREAKEVEN", pnl: 0, rMultiple: 0 }),
      trade({ id: "open", outcome: "OPEN", pnl: null, rMultiple: null }),
    ]);
    expect(result.closedTrades).toBe(3);
    expect(result.pnlTrades).toBe(3);
    expect(result.wins).toBe(1);
    expect(result.losses).toBe(1);
    expect(result.breakevens).toBe(1);
    expect(result.grossProfit).toBe(100);
    expect(result.grossLoss).toBe(50);
    expect(result.profitFactor).toBe(2);
    expect(result.expectancy).toBeCloseTo(50 / 3);
    expect(result.averageWin).toBe(100);
    expect(result.averageLoss).toBe(50);
    expect(result.payoffRatio).toBe(2);
    expect(result.averageR).toBeCloseTo(1 / 3);
  });

  it("calculates chronological drawdown and percentage from realized P&L", () => {
    const result = analyzeJournal([
      trade({ id: "3", date: "2026-10-03", pnl: -30, outcome: "LOSS" }),
      trade({ id: "1", date: "2026-10-01", pnl: 100, outcome: "WIN" }),
      trade({ id: "2", date: "2026-10-02", pnl: -20, outcome: "LOSS" }),
    ]);
    expect(result.maxDrawdown).toBe(50);
    expect(result.maxDrawdownPercent).toBe(50);
  });

  it("returns unavailable ratios when denominator data is absent", () => {
    const result = analyzeJournal([trade({ pnl: 20 }), trade({ id: "open", outcome: "OPEN", pnl: null })]);
    expect(result.profitFactor).toBeNull();
    expect(result.payoffRatio).toBeNull();
    expect(result.maxDrawdownPercent).toBeNull();
    expect(result.expectancy).toBe(20);
  });

  it("calculates streaks in chronological order and resets on breakeven", () => {
    const result = analyzeJournal([
      trade({ id: "5", date: "2026-10-05", outcome: "LOSS", pnl: -1 }),
      trade({ id: "1", date: "2026-10-01", outcome: "WIN", pnl: 1 }),
      trade({ id: "2", date: "2026-10-02", outcome: "WIN", pnl: 1 }),
      trade({ id: "3", date: "2026-10-03", outcome: "BREAKEVEN", pnl: 0 }),
      trade({ id: "4", date: "2026-10-04", outcome: "LOSS", pnl: -1 }),
    ]);
    expect(result.bestWinStreak).toBe(2);
    expect(result.worstLossStreak).toBe(2);
    expect(result.currentStreak).toEqual({ kind: "LOSS", length: 2 });
  });

  it("breaks down closed trades by setup, session and emotion", () => {
    const result = analyzeJournal([
      trade({ id: "1", pnl: 50, setup: "Sweep", session: "London", emotion: "Calm" }),
      trade({ id: "2", pnl: -10, outcome: "LOSS", setup: "Sweep", session: "New York", emotion: "FOMO" }),
      trade({ id: "3", pnl: null, outcome: "OPEN", setup: "Open setup" }),
    ]);
    expect(result.setups[0]).toMatchObject({ key: "Sweep", trades: 2, wins: 1, losses: 1, netPnl: 40, winRate: 50 });
    expect(result.sessions.map((row) => row.key)).toEqual(["London", "New York"]);
    expect(result.emotions.map((row) => row.key)).toEqual(["Calm", "FOMO"]);
    expect(result.setups.some((row) => row.key === "Open setup")).toBe(false);
  });

  it("does not mutate the caller's array", () => {
    const entries = [trade({ id: "b", date: "2026-10-02" }), trade({ id: "a", date: "2026-10-01" })];
    const before = entries.map((entry) => entry.id);
    analyzeJournal(entries);
    expect(entries.map((entry) => entry.id)).toEqual(before);
  });
});
