import type { JournalEntry } from "./journal-store";

const COLUMNS: Array<{ header: string; value: (entry: JournalEntry) => unknown; text?: boolean }> =
  [
    { header: "Date", value: (entry) => entry.date, text: true },
    { header: "Symbol", value: (entry) => entry.symbol, text: true },
    { header: "Side", value: (entry) => entry.side, text: true },
    { header: "Outcome", value: (entry) => entry.outcome, text: true },
    { header: "Setup", value: (entry) => entry.setup, text: true },
    { header: "Session", value: (entry) => entry.session, text: true },
    { header: "Entry", value: (entry) => entry.entryPrice },
    { header: "Exit", value: (entry) => entry.exitPrice },
    { header: "Stop loss", value: (entry) => entry.stopLoss },
    { header: "Quantity", value: (entry) => entry.quantity },
    { header: "Realized P&L", value: (entry) => entry.pnl },
    { header: "R multiple", value: (entry) => entry.rMultiple },
    { header: "HTF bias", value: (entry) => entry.higherTimeframeBias, text: true },
    { header: "Liquidity target", value: (entry) => entry.liquidityTarget, text: true },
    { header: "Confluence", value: (entry) => entry.confluence.join(" | "), text: true },
    { header: "Emotion", value: (entry) => entry.emotion, text: true },
    { header: "Execution quality", value: (entry) => entry.executionQuality, text: true },
    { header: "Mistake", value: (entry) => entry.mistake, text: true },
    { header: "Rule adherence", value: (entry) => entry.ruleAdherence, text: true },
    { header: "Thesis", value: (entry) => entry.thesis, text: true },
    { header: "Notes", value: (entry) => entry.notes, text: true },
    { header: "Reflection", value: (entry) => entry.reflection, text: true },
    { header: "Created at", value: (entry) => entry.createdAt, text: true },
    { header: "Updated at", value: (entry) => entry.updatedAt, text: true },
  ];

function csvCell(value: unknown, text = false): string {
  if (value === null || value === undefined) return "";
  let normalized = String(value);
  // Prevent spreadsheet formula execution in imported/user-authored text cells.
  if (text && /^[\t\r ]*[=+@-]/.test(normalized)) normalized = "'" + normalized;
  return /[",\r\n]/.test(normalized) ? '"' + normalized.replace(/"/g, '""') + '"' : normalized;
}

/** Export all journal records without embedding private chart-image data. */
export function encodeJournalCsv(entries: readonly JournalEntry[]): string {
  const header = COLUMNS.map((column) => csvCell(column.header)).join(",");
  const rows = entries.map((entry) =>
    COLUMNS.map((column) => csvCell(column.value(entry), column.text)).join(","),
  );
  return "\uFEFF" + [header, ...rows].join("\r\n") + "\r\n";
}
