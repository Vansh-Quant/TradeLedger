export type JournalSide = "LONG" | "SHORT";
export type JournalOutcome = "WIN" | "LOSS" | "BREAKEVEN" | "OPEN";

export interface JournalEntry {
  id: string;
  date: string;
  symbol: string;
  side: JournalSide;
  setup: string;
  session: string;
  entryPrice: number | null;
  exitPrice: number | null;
  stopLoss: number | null;
  quantity: number | null;
  pnl: number | null;
  rMultiple: number | null;
  outcome: JournalOutcome;
  higherTimeframeBias: string;
  liquidityTarget: string;
  confluence: string[];
  emotion: string;
  executionQuality: string;
  mistake: string;
  ruleAdherence: string;
  thesis: string;
  notes: string;
  reflection: string;
  screenshotData?: string;
  createdAt: string;
  updatedAt: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const finiteOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export function decodeJournalEntries(raw: string | null): JournalEntry[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is Record<string, unknown> => isRecord(item))
      .filter((item) =>
        typeof item["id"] === "string" &&
        typeof item["date"] === "string" &&
        typeof item["symbol"] === "string" &&
        (item["side"] === "LONG" || item["side"] === "SHORT") &&
        (item["outcome"] === "WIN" || item["outcome"] === "LOSS" || item["outcome"] === "BREAKEVEN" || item["outcome"] === "OPEN"),
      )
      .map((item) => ({
        id: item["id"] as string,
        date: item["date"] as string,
        symbol: (item["symbol"] as string).slice(0, 32),
        side: item["side"] as JournalSide,
        setup: typeof item["setup"] === "string" ? item["setup"] : "",
        session: typeof item["session"] === "string" ? item["session"] : "",
        entryPrice: finiteOrNull(item["entryPrice"]),
        exitPrice: finiteOrNull(item["exitPrice"]),
        stopLoss: finiteOrNull(item["stopLoss"]),
        quantity: finiteOrNull(item["quantity"]),
        pnl: finiteOrNull(item["pnl"]),
        rMultiple: finiteOrNull(item["rMultiple"]),
        outcome: item["outcome"] as JournalOutcome,
        higherTimeframeBias: typeof item["higherTimeframeBias"] === "string" ? item["higherTimeframeBias"] : "",
        liquidityTarget: typeof item["liquidityTarget"] === "string" ? item["liquidityTarget"] : "",
        confluence: Array.isArray(item["confluence"]) ? item["confluence"].filter((v): v is string => typeof v === "string").slice(0, 24) : [],
        emotion: typeof item["emotion"] === "string" ? item["emotion"] : "",
        executionQuality: typeof item["executionQuality"] === "string" ? item["executionQuality"] : "",
        mistake: typeof item["mistake"] === "string" ? item["mistake"] : "",
        ruleAdherence: typeof item["ruleAdherence"] === "string" ? item["ruleAdherence"] : "",
        thesis: typeof item["thesis"] === "string" ? item["thesis"] : "",
        notes: typeof item["notes"] === "string" ? item["notes"] : "",
        reflection: typeof item["reflection"] === "string" ? item["reflection"] : "",
        ...(typeof item["screenshotData"] === "string" && item["screenshotData"].startsWith("data:image/") ? { screenshotData: item["screenshotData"] } : {}),
        createdAt: typeof item["createdAt"] === "string" ? item["createdAt"] : new Date(0).toISOString(),
        updatedAt: typeof item["updatedAt"] === "string" ? item["updatedAt"] : new Date(0).toISOString(),
      }));
  } catch {
    return [];
  }
}

export function encodeJournalEntries(entries: readonly JournalEntry[]): string {
  return JSON.stringify(entries);
}


function legacyNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

/** Accepts native TradeLedger backups and the old private desk's tl_trades export. */
export function decodeJournalBackup(raw: string): JournalEntry[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (isRecord(parsed) && "tl_trades" in parsed) {
    let legacy: unknown = parsed["tl_trades"];
    if (typeof legacy === "string") {
      try { legacy = JSON.parse(legacy); } catch { return null; }
    }
    if (!Array.isArray(legacy)) return null;
    const normalized = legacy.map((value, index) => {
      if (!isRecord(value)) return null;
      const outcomeText = String(value["outcome"] ?? "").trim().toLowerCase();
      const outcome: JournalOutcome =
        outcomeText === "win" ? "WIN" :
        outcomeText === "loss" ? "LOSS" :
        ["be", "break-even", "breakeven", "break even"].includes(outcomeText) ? "BREAKEVEN" : "OPEN";
      const firstImage = Array.isArray(value["images"]) ? value["images"][0] : undefined;
      const imageData = typeof firstImage === "string" ? firstImage :
        isRecord(firstImage) && typeof firstImage["data"] === "string" ? firstImage["data"] : undefined;
      const timestamp = typeof value["loggedAt"] === "string" ? value["loggedAt"] : new Date(0).toISOString();
      return {
        id: String(value["id"] ?? ("legacy-" + index)),
        date: typeof value["date"] === "string" ? value["date"] : "",
        symbol: typeof value["symbol"] === "string" ? value["symbol"] : "",
        side: String(value["dir"] ?? "").toLowerCase() === "short" ? "SHORT" : "LONG",
        setup: typeof value["setup"] === "string" ? value["setup"] : "",
        session: typeof value["session"] === "string" ? value["session"] : "",
        entryPrice: legacyNumber(value["entry"]),
        exitPrice: legacyNumber(value["exit"]),
        stopLoss: legacyNumber(value["sl"]),
        quantity: legacyNumber(value["qty"]),
        pnl: legacyNumber(value["pnl"]),
        rMultiple: legacyNumber(value["rr"]),
        outcome,
        higherTimeframeBias: typeof value["htf"] === "string" ? value["htf"] : "",
        liquidityTarget: typeof value["liquidity"] === "string" ? value["liquidity"] : "",
        confluence: Array.isArray(value["confluence"]) ? value["confluence"].filter((item): item is string => typeof item === "string") : [],
        emotion: typeof value["emotion"] === "string" ? value["emotion"] : "",
        executionQuality: Array.isArray(value["execQuality"]) ? value["execQuality"].filter((item): item is string => typeof item === "string").join(", ") : "",
        mistake: typeof value["mistake"] === "string" ? value["mistake"] : "",
        ruleAdherence: typeof value["ruleAdhere"] === "string" ? value["ruleAdhere"] : "",
        thesis: typeof value["thesis"] === "string" ? value["thesis"] : "",
        notes: typeof value["notes"] === "string" ? value["notes"] : "",
        reflection: typeof value["reflection"] === "string" ? value["reflection"] : "",
        ...(typeof imageData === "string" && imageData.startsWith("data:image/") ? { screenshotData: imageData } : {}),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    });
    if (normalized.some((entry) => entry === null)) return null;
    const entries = decodeJournalEntries(JSON.stringify(normalized));
    return entries.length === normalized.length ? entries : null;
  }

  const payload = isRecord(parsed) && "entries" in parsed ? parsed["entries"] : parsed;
  if (!Array.isArray(payload)) return null;
  const entries = decodeJournalEntries(JSON.stringify(payload));
  return entries.length === payload.length ? entries : null;
}

export interface JournalBreakdown {
  key: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  expectancy: number;
}

export interface JournalAnalytics {
  total: number;
  closed: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;
  pnl: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number | null;
  expectancy: number;
  averageWin: number | null;
  averageLoss: number | null;
  averageR: number | null;
  maxDrawdown: number;
  maxDrawdownPercent: number | null;
  bySetup: JournalBreakdown[];
  bySession: JournalBreakdown[];
  bySide: JournalBreakdown[];
  byRuleAdherence: JournalBreakdown[];
}

const validMetric = (value: number | null): value is number =>
  value !== null && Number.isFinite(value);

function breakdownJournal(entries: readonly JournalEntry[], keyOf: (entry: JournalEntry) => string): JournalBreakdown[] {
  const groups = new Map<string, JournalEntry[]>();
  for (const entry of entries) {
    if (entry.outcome === "OPEN") continue;
    const key = keyOf(entry).trim() || "Unspecified";
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, group]) => {
    const wins = group.filter((entry) => entry.outcome === "WIN").length;
    const losses = group.filter((entry) => entry.outcome === "LOSS").length;
    const netPnl = group.reduce((sum, entry) => sum + (validMetric(entry.pnl) ? entry.pnl : 0), 0);
    return {
      key,
      trades: group.length,
      wins,
      losses,
      winRate: group.length === 0 ? 0 : (wins / group.length) * 100,
      netPnl,
      expectancy: group.length === 0 ? 0 : netPnl / group.length,
    };
  }).sort((a, b) => b.netPnl - a.netPnl || a.key.localeCompare(b.key));
}

/**
 * Produces deterministic journal metrics. Only closed trades contribute to
 * outcome statistics; OPEN trades do not affect P&L, expectancy or drawdown.
 * Drawdown follows trade date then creation timestamp, never input-array order.
 */
export function summarizeJournal(entries: readonly JournalEntry[]): JournalAnalytics {
  const closed = entries.filter((entry) => entry.outcome !== "OPEN");
  const wins = closed.filter((entry) => entry.outcome === "WIN");
  const losses = closed.filter((entry) => entry.outcome === "LOSS");
  const breakeven = closed.filter((entry) => entry.outcome === "BREAKEVEN");
  const pnlOf = (entry: JournalEntry) => validMetric(entry.pnl) ? entry.pnl : 0;
  const pnl = closed.reduce((sum, entry) => sum + pnlOf(entry), 0);
  const grossProfit = wins.reduce((sum, entry) => sum + Math.max(0, pnlOf(entry)), 0);
  const grossLoss = Math.abs(losses.reduce((sum, entry) => sum + Math.min(0, pnlOf(entry)), 0));
  const winPnls = wins.map(pnlOf).filter((value) => value > 0);
  const lossPnls = losses.map(pnlOf).filter((value) => value < 0);
  const rValues = closed.map((entry) => entry.rMultiple).filter(validMetric);
  const ordered = [...closed].sort((a, b) =>
    a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let maxDrawdownPercent: number | null = null;
  for (const entry of ordered) {
    cumulative += pnlOf(entry);
    peak = Math.max(peak, cumulative);
    const drawdown = peak - cumulative;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      maxDrawdownPercent = peak > 0 ? (drawdown / peak) * 100 : null;
    }
  }
  return {
    total: entries.length,
    closed: closed.length,
    wins: wins.length,
    losses: losses.length,
    breakeven: breakeven.length,
    winRate: closed.length === 0 ? 0 : (wins.length / closed.length) * 100,
    pnl,
    grossProfit,
    grossLoss,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? null : 0,
    expectancy: closed.length === 0 ? 0 : pnl / closed.length,
    averageWin: winPnls.length === 0 ? null : winPnls.reduce((sum, value) => sum + value, 0) / winPnls.length,
    averageLoss: lossPnls.length === 0 ? null : lossPnls.reduce((sum, value) => sum + value, 0) / lossPnls.length,
    averageR: rValues.length === 0 ? null : rValues.reduce((sum, value) => sum + value, 0) / rValues.length,
    maxDrawdown,
    maxDrawdownPercent,
    bySetup: breakdownJournal(closed, (entry) => entry.setup),
    bySession: breakdownJournal(closed, (entry) => entry.session),
    bySide: breakdownJournal(closed, (entry) => entry.side),
    byRuleAdherence: breakdownJournal(closed, (entry) => entry.ruleAdherence),
  };
}
