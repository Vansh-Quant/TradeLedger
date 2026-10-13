import { describe, expect, it } from "vitest";
import { decodeJournalBackup, decodeJournalEntries, encodeJournalEntries, summarizeJournal, type JournalEntry } from "../lib/journal-store";

const entry = (overrides: Partial<JournalEntry> = {}): JournalEntry => ({
  id: "j-1", date: "2026-10-13", symbol: "XAUUSD", side: "LONG", setup: "Liquidity sweep",
  session: "London", entryPrice: 2300, exitPrice: 2310, stopLoss: 2295, quantity: 1,
  pnl: 10, rMultiple: 2, outcome: "WIN", higherTimeframeBias: "Bullish", liquidityTarget: "PDH",
  confluence: ["Sweep", "MSS"], emotion: "Calm", executionQuality: "Excellent — followed plan",
  mistake: "", ruleAdherence: "Followed all rules", thesis: "Sweep and reclaim", notes: "Waited for close",
  reflection: "Repeat patiently", createdAt: "2026-10-13T10:00:00.000Z", updatedAt: "2026-10-13T10:00:00.000Z",
  ...overrides,

  it("imports trades from the old Private Trading Desk localStorage export", () => {
    const backup = {
      tl_trades: JSON.stringify([{
        id: 1730000000000, date: "2026-10-12", symbol: "XAUUSD", dir: "Short",
        entry: 2650.5, exit: 2640.5, sl: 2655, qty: 1, pnl: 10, rr: 2,
        outcome: "Win", setup: "Liquidity sweep", session: "London",
        htf: "Bearish", liquidity: "PDL", confluence: ["Sweep", "MSS"],
        emotion: "Calm", execQuality: ["Followed plan"], mistake: "",
        ruleAdhere: "Yes", thesis: "Sweep and rejection", notes: "Waited for close",
        reflection: "Repeat", loggedAt: "2026-10-12T10:00:00.000Z",
        images: [{ data: "data:image/jpeg;base64,AA==", name: "chart.jpg" }],
      }]),
      tl_rules: JSON.stringify(["Do not chase"]),
    };
    const imported = decodeJournalBackup(JSON.stringify(backup));
    expect(imported).toHaveLength(1);
    expect(imported?.[0]).toMatchObject({
      id: "1730000000000",
      symbol: "XAUUSD",
      side: "SHORT",
      outcome: "WIN",
      entryPrice: 2650.5,
      rMultiple: 2,
      confluence: ["Sweep", "MSS"],
      screenshotData: "data:image/jpeg;base64,AA==",
    });
  });

  it("rejects unrelated or malformed backup files", () => {
    expect(decodeJournalBackup("{broken")).toBeNull();
    expect(decodeJournalBackup(JSON.stringify({ unrelated: true }))).toBeNull();
  });

});

describe("local trade journal store", () => {
  it("round-trips complete journal entries", () => {
    const entries = [entry()];
    expect(decodeJournalEntries(encodeJournalEntries(entries))).toEqual(entries);
  });

  it("ignores malformed data and records without required identity fields", () => {
    expect(decodeJournalEntries("{broken")).toEqual([]);
    expect(decodeJournalEntries(JSON.stringify([{ symbol: "XAUUSD" }, entry()]))).toEqual([entry()]);
  });

  it("calculates win rate from closed trades and excludes open trades", () => {
    const summary = summarizeJournal([
      entry(),
      entry({ id: "j-2", outcome: "LOSS", pnl: -5, rMultiple: -1 }),
      entry({ id: "j-3", outcome: "OPEN", pnl: null, rMultiple: null }),
    ]);
    expect(summary.total).toBe(3);
    expect(summary.closed).toBe(2);
    expect(summary.wins).toBe(1);
    expect(summary.winRate).toBe(50);
    expect(summary.pnl).toBe(5);
    expect(summary.averageR).toBe(0.5);
  });
});
