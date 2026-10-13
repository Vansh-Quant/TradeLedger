import type { JournalEntry } from "./journal-store";

export type StreakKind = "WIN" | "LOSS" | "NONE";

export interface JournalBreakdownRow {
  key: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  averageR: number | null;
}

export interface JournalAnalytics {
  closedTrades: number;
  pnlTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number | null;
  expectancy: number | null;
  averageWin: number | null;
  averageLoss: number | null;
  payoffRatio: number | null;
  averageR: number | null;
  maxDrawdown: number | null;
  maxDrawdownPercent: number | null;
  currentStreak: { kind: StreakKind; length: number };
  bestWinStreak: number;
  worstLossStreak: number;
  setups: JournalBreakdownRow[];
  sessions: JournalBreakdownRow[];
  emotions: JournalBreakdownRow[];
}

function average(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function chronological(entries: readonly JournalEntry[]): JournalEntry[] {
  return [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

function streaks(entries: readonly JournalEntry[]): Pick<JournalAnalytics, "currentStreak" | "bestWinStreak" | "worstLossStreak"> {
  let currentKind: StreakKind = "NONE";
  let currentLength = 0;
  let bestWinStreak = 0;
  let worstLossStreak = 0;

  for (const entry of chronological(entries)) {
    const kind: StreakKind = entry.outcome === "WIN" ? "WIN" : entry.outcome === "LOSS" ? "LOSS" : "NONE";
    if (kind === "NONE") {
      currentKind = "NONE";
      currentLength = 0;
      continue;
    }
    currentLength = currentKind === kind ? currentLength + 1 : 1;
    currentKind = kind;
    if (kind === "WIN") bestWinStreak = Math.max(bestWinStreak, currentLength);
    else worstLossStreak = Math.max(worstLossStreak, currentLength);
  }

  return { currentStreak: { kind: currentKind, length: currentLength }, bestWinStreak, worstLossStreak };
}

function breakdown(entries: readonly JournalEntry[], field: "setup" | "session" | "emotion"): JournalBreakdownRow[] {
  const grouped = new Map<string, JournalEntry[]>();
  for (const entry of entries) {
    if (entry.outcome === "OPEN") continue;
    const label = entry[field].trim() || "Untagged";
    const group = grouped.get(label) ?? [];
    group.push(entry);
    grouped.set(label, group);
  }

  return [...grouped.entries()].map(([key, group]) => {
    const wins = group.filter((entry) => entry.outcome === "WIN").length;
    const losses = group.filter((entry) => entry.outcome === "LOSS").length;
    const pnlValues = group.map((entry) => entry.pnl).filter((value): value is number => value !== null && Number.isFinite(value));
    const rValues = group.map((entry) => entry.rMultiple).filter((value): value is number => value !== null && Number.isFinite(value));
    return {
      key,
      trades: group.length,
      wins,
      losses,
      winRate: group.length === 0 ? 0 : (wins / group.length) * 100,
      netPnl: pnlValues.reduce((sum, value) => sum + value, 0),
      averageR: average(rValues),
    };
  }).sort((a, b) => b.netPnl - a.netPnl || b.trades - a.trades || a.key.localeCompare(b.key));
}

export function analyzeJournal(entries: readonly JournalEntry[]): JournalAnalytics {
  const closed = entries.filter((entry) => entry.outcome !== "OPEN");
  const wins = closed.filter((entry) => entry.outcome === "WIN").length;
  const losses = closed.filter((entry) => entry.outcome === "LOSS").length;
  const breakevens = closed.filter((entry) => entry.outcome === "BREAKEVEN").length;
  const pnlEntries = chronological(closed.filter((entry) => entry.pnl !== null && Number.isFinite(entry.pnl)));
  const pnls = pnlEntries.map((entry) => entry.pnl as number);
  const positive = pnls.filter((value) => value > 0);
  const negative = pnls.filter((value) => value < 0);
  const grossProfit = positive.reduce((sum, value) => sum + value, 0);
  const grossLoss = Math.abs(negative.reduce((sum, value) => sum + value, 0));
  const rValues = closed.map((entry) => entry.rMultiple).filter((value): value is number => value !== null && Number.isFinite(value));

  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let maxDrawdownPercent: number | null = null;
  for (const entry of pnlEntries) {
    equity += entry.pnl as number;
    peak = Math.max(peak, equity);
    const drawdown = peak - equity;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
    if (peak > 0 && drawdown > 0) {
      const drawdownPercent = (drawdown / peak) * 100;
      maxDrawdownPercent = maxDrawdownPercent === null
        ? drawdownPercent
        : Math.max(maxDrawdownPercent, drawdownPercent);
    }
  }

  const streakSummary = streaks(closed);
  return {
    closedTrades: closed.length,
    pnlTrades: pnlEntries.length,
    wins,
    losses,
    breakevens,
    grossProfit,
    grossLoss,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    expectancy: pnls.length > 0 ? pnls.reduce((sum, value) => sum + value, 0) / pnls.length : null,
    averageWin: average(positive),
    averageLoss: negative.length > 0 ? Math.abs(average(negative) as number) : null,
    payoffRatio: negative.length > 0 && positive.length > 0
      ? (average(positive) as number) / Math.abs(average(negative) as number)
      : null,
    averageR: average(rValues),
    maxDrawdown: pnlEntries.length > 0 ? maxDrawdown : null,
    maxDrawdownPercent,
    ...streakSummary,
    setups: breakdown(entries, "setup"),
    sessions: breakdown(entries, "session"),
    emotions: breakdown(entries, "emotion"),
  };
}
