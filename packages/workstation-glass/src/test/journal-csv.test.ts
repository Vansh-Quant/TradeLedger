import { describe, expect, it } from "vitest";
import { encodeJournalCsv } from "../lib/journal-csv";
import type { JournalEntry } from "../lib/journal-store";

const entry = (overrides: Partial<JournalEntry> = {}): JournalEntry => ({
  id: "csv-1",
  date: "2026-10-13",
  symbol: "XAUUSD",
  side: "LONG",
  setup: "Liquidity sweep",
  session: "London",
  entryPrice: 2300,
  exitPrice: 2310,
  stopLoss: 2295,
  quantity: 1,
  pnl: -12.5,
  rMultiple: -1,
  outcome: "LOSS",
  higherTimeframeBias: "Bearish",
  liquidityTarget: "PDL",
  confluence: ["Sweep", "MSS"],
  emotion: "Calm",
  executionQuality: "Followed plan",
  mistake: "",
  ruleAdherence: "Followed rules",
  thesis: "Reclaim",
  notes: 'comma, and "quote"',
  reflection: "line one\nline two",
  createdAt: "2026-10-13T10:00:00.000Z",
  updatedAt: "2026-10-13T10:00:00.000Z",
  ...overrides,
});

describe("journal CSV export", () => {
  it("exports readable columns, preserves negative numeric values and quotes CSV delimiters", () => {
    const csv = encodeJournalCsv([entry()]);
    expect(csv.startsWith("\uFEFFDate,Symbol,Side,Outcome")).toBe(true);
    expect(csv).toContain("2300,2310,2295,1,-12.5,-1");
    expect(csv).toContain('"comma, and ""quote"""');
    expect(csv).toContain('"line one\nline two"');
    expect(csv).toContain("Sweep | MSS");
  });

  it("neutralizes formula-like user text and never exports image payloads", () => {
    const csv = encodeJournalCsv([
      entry({
        notes: '=HYPERLINK("https://example.invalid")',
        screenshotData: "data:image/jpeg;base64,PRIVATE_IMAGE_BYTES",
      }),
    ]);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).not.toContain("PRIVATE_IMAGE_BYTES");
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("exports headers even when there are no entries", () => {
    const csv = encodeJournalCsv([]);
    expect(csv).toContain("Date,Symbol,Side,Outcome");
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(1);
  });
});
