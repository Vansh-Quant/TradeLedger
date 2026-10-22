import { describe, expect, it } from "vitest";
import { summarizeJournal, type JournalEntry } from "./journal-store";

function trade(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: "trade-1",
    date: "2026-10-01",
    symbol: "EURUSD",
    side: "LONG",
    setup: "Breakout",
    session: "London",
    entryPrice: 1.1,
    exitPrice: 1.101,
    stopLoss: 1.099,
    quantity: 1,
    pnl: 100,
    rMultiple: 2,
    outcome: "WIN",
    higherTimeframeBias: "",
    liquidityTarget: "",
    confluence: [],
    emotion: "",
    executionQuality: "",
    mistake: "",
    ruleAdherence: "Followed",
    thesis: "",
    notes: "",
    reflection: "",
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("summarizeJournal", () => {
  it("returns stable zero metrics for an empty journal", () => {
    expect(summarizeJournal([])).toMatchObject({
      total: 0, closed: 0, wins: 0, losses: 0, breakeven: 0,
      winRate: 0, pnl: 0, grossProfit: 0, grossLoss: 0,
      profitFactor: 0, expectancy: 0, averageWin: null, averageLoss: null,
      averageR: null, maxDrawdown: 0, maxDrawdownPercent: null,
    });
  });

  it("excludes open trades from performance metrics", () => {
    const result = summarizeJournal([
      trade(),
      trade({ id: "open", outcome: "OPEN", pnl: 9999, date: "2026-10-02" }),
    ]);
    expect(result.total).toBe(2);
    expect(result.closed).toBe(1);
    expect(result.pnl).toBe(100);
    expect(result.expectancy).toBe(100);
  });

  it("calculates profit factor, expectancy, average win/loss and R", () => {
    const result = summarizeJournal([
      trade({ id: "w1", pnl: 100, rMultiple: 2, outcome: "WIN" }),
      trade({ id: "w2", pnl: 50, rMultiple: 1, outcome: "WIN" }),
      trade({ id: "l1", pnl: -50, rMultiple: -1, outcome: "LOSS" }),
      trade({ id: "be", pnl: 0, rMultiple: 0, outcome: "BREAKEVEN" }),
    ]);
    expect(result).toMatchObject({
      closed: 4, wins: 2, losses: 1, breakeven: 1,
      winRate: 50, pnl: 100, grossProfit: 150, grossLoss: 50,
      profitFactor: 3, expectancy: 25, averageWin: 75, averageLoss: -50,
      averageR: 0.5,
    });
  });

  it("calculates drawdown chronologically and independently of input order", () => {
    const trades = [
      trade({ id: "third", date: "2026-10-03", pnl: -30, outcome: "LOSS" }),
      trade({ id: "first", date: "2026-10-01", pnl: 100, outcome: "WIN" }),
      trade({ id: "second", date: "2026-10-02", pnl: -40, outcome: "LOSS" }),
    ];
    const result = summarizeJournal(trades);
    expect(result.maxDrawdown).toBe(70);
    expect(result.maxDrawdownPercent).toBe(70);
    expect(summarizeJournal([...trades].reverse()).maxDrawdown).toBe(70);
  });

  it("groups closed trades by setup, session, side, and rule adherence", () => {
    const result = summarizeJournal([
      trade({ id: "a", setup: "Breakout", session: "London", side: "LONG", pnl: 100 }),
      trade({ id: "b", setup: "Breakout", session: "New York", side: "SHORT", pnl: -25, outcome: "LOSS" }),
      trade({ id: "c", setup: "", session: "", ruleAdherence: "", pnl: 500, outcome: "OPEN" }),
    ]);
    expect(result.bySetup).toHaveLength(1);
    expect(result.bySetup[0]).toMatchObject({ key: "Breakout", trades: 2, wins: 1, losses: 1, netPnl: 75 });
    expect(result.bySession.map((item) => item.key)).toEqual(["London", "New York"]);
    expect(result.bySide).toHaveLength(2);
    expect(result.byRuleAdherence).toHaveLength(1);
  });

  it("handles missing and non-finite metrics safely", () => {
    const result = summarizeJournal([
      trade({ pnl: null, rMultiple: null }),
      trade({ id: "bad", outcome: "LOSS", pnl: Number.NaN, rMultiple: Number.POSITIVE_INFINITY }),
    ]);
    expect(result.pnl).toBe(0);
    expect(result.averageR).toBeNull();
    expect(result.averageWin).toBeNull();
    expect(result.averageLoss).toBeNull();
  });
});
