import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent, type ChangeEvent, type ReactNode } from "react";
import { Download, FileUp, ImagePlus, Pencil, Plus, Save, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Panel, EmptyState } from "@/components/terminal/primitives";
import { JournalAnalyticsPanel } from "@/components/JournalAnalyticsPanel";
import {
  decodeJournalEntries, decodeJournalBackup, encodeJournalEntries, summarizeJournal,
  type JournalEntry, type JournalOutcome, type JournalSide,
} from "@/lib/journal-store";

export const Route = createFileRoute("/journal")({ component: JournalPage });

const STORAGE_KEY = "tradeledger:personal-journal:v1";
const inputClass = "mt-1 h-9 w-full rounded-sm border border-input bg-background/60 px-2 text-xs outline-none focus:border-primary";
const selectClass = inputClass;
const areaClass = "mt-1 min-h-20 w-full resize-y rounded-sm border border-input bg-background/60 px-2 py-2 text-xs outline-none focus:border-primary";
const outcomes: JournalOutcome[] = ["WIN", "LOSS", "BREAKEVEN", "OPEN"];

type Draft = Omit<JournalEntry, "id" | "createdAt" | "updatedAt">;
function todayLocal(): string {
  const now = new Date();
  return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
}
const blankDraft = (): Draft => ({
  date: todayLocal(),
  symbol: "",
  side: "LONG",
  setup: "",
  session: "",
  entryPrice: null,
  exitPrice: null,
  stopLoss: null,
  quantity: null,
  pnl: null,
  rMultiple: null,
  outcome: "OPEN",
  higherTimeframeBias: "",
  liquidityTarget: "",
  confluence: [],
  emotion: "",
  executionQuality: "",
  mistake: "",
  ruleAdherence: "",
  thesis: "",
  notes: "",
  reflection: "",
});

function numberField(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function fmtMoney(value: number | null | undefined): string {
  if (value == null) return "—";
  return (value < 0 ? "−" : value > 0 ? "+" : "") + "$" + Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtNumber(value: number | null | undefined, suffix = ""): string {
  return value == null ? "—" : value.toFixed(2) + suffix;
}
function localId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
}
async function compressScreenshot(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > 12 * 1024 * 1024) throw new Error("Screenshot must be 12 MB or smaller.");
  const source = await new Promise<HTMLImageElement>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read screenshot."));
    reader.onload = () => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not decode screenshot."));
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
  const scale = Math.min(1, 1400 / source.width, 1000 / source.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image processing is unavailable.");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.72);
}

function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [confluenceText, setConfluenceText] = useState("");
  const [screenshotName, setScreenshotName] = useState("");
  const [importInputKey, setImportInputKey] = useState(0);

  useEffect(() => {
    try {
      setEntries(decodeJournalEntries(window.localStorage.getItem(STORAGE_KEY)));
    } catch {
      toast.error("Browser storage is unavailable. Enable local storage to use the journal.");
    } finally {
      setReady(true);
    }
  }, []);

  const stats = useMemo(() => summarizeJournal(entries), [entries]);
  const filtered = useMemo(() => entries.filter((entry) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [entry.symbol, entry.setup, entry.notes, entry.thesis, entry.mistake]
      .some((value) => value.toLowerCase().includes(query));
    return matchesSearch && (!outcomeFilter || entry.outcome === outcomeFilter) && (!dateFilter || entry.date === dateFilter);
  }).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)), [entries, search, outcomeFilter, dateFilter]);

  function persist(next: JournalEntry[]) {
    try {
      window.localStorage.setItem(STORAGE_KEY, encodeJournalEntries(next));
      setEntries(next);
      return true;
    } catch {
      toast.error("Could not save journal. Export a backup or remove the screenshot to free browser storage.");
      return false;
    }
  }
  function setField<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  function startNew() {
    setEditingId(null);
    setDraft(blankDraft());
    setConfluenceText("");
    setScreenshotName("");
    setShowForm(true);
  }
  function startEdit(entry: JournalEntry) {
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = entry;
    setEditingId(entry.id);
    setDraft(rest);
    setConfluenceText(entry.confluence.join(", "));
    setScreenshotName(entry.screenshotData ? "Screenshot attached" : "");
    setShowForm(true);
  }
  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setDraft(blankDraft());
    setConfluenceText("");
    setScreenshotName("");
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const symbol = draft.symbol.trim().toUpperCase();
    if (!draft.date || !symbol) {
      toast.error("Date and symbol are required.");
      return;
    }
    if (draft.quantity !== null && draft.quantity <= 0) {
      toast.error("Quantity must be greater than zero.");
      return;
    }
    if ([draft.entryPrice, draft.exitPrice, draft.stopLoss, draft.quantity, draft.pnl, draft.rMultiple]
      .some((value) => value !== null && !Number.isFinite(value))) {
      toast.error("Numeric fields must contain valid numbers.");
      return;
    }
    const now = new Date().toISOString();
    const existing = editingId ? entries.find((entry) => entry.id === editingId) : undefined;
    const entry: JournalEntry = {
      ...draft,
      symbol,
      confluence: confluenceText.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 24),
      id: existing?.id ?? localId(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const next = existing
      ? entries.map((item) => item.id === existing.id ? entry : item)
      : [...entries, entry];
    if (persist(next)) {
      toast.success(existing ? "Journal entry updated." : "Trade journaled.");
      cancelForm();
    }
  }
  async function handleScreenshot(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const screenshotData = await compressScreenshot(file);
      setField("screenshotData", screenshotData);
      setScreenshotName(file.name + " · compressed for local storage");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Screenshot could not be added.");
    } finally {
      event.target.value = "";
    }
  }
  function removeScreenshot() {
    setField("screenshotData", undefined);
    setScreenshotName("");
  }
  function removeEntry(id: string) {
    if (!window.confirm("Delete this journal entry? This cannot be undone unless you have an export backup.")) return;
    if (persist(entries.filter((entry) => entry.id !== id))) toast.success("Journal entry deleted.");
  }
  function exportBackup() {
    const blob = new Blob([JSON.stringify({ format: "tradeledger-journal-v1", exportedAt: new Date().toISOString(), entries }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "tradeledger-journal-" + new Date().toISOString().slice(0, 10) + ".json";
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Journal backup exported.");
  }
  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = decodeJournalBackup(await file.text());
      if (imported === null) {
        throw new Error("This file is not a valid TradeLedger or Private Trading Desk backup.");
      }
      const byId = new Map(entries.map((entry) => [entry.id, entry]));
      imported.forEach((entry) => byId.set(entry.id, entry));
      if (persist([...byId.values()])) toast.success("Imported " + imported.length + " journal entries.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not import this backup.");
    } finally {
      event.target.value = "";
      setImportInputKey((key) => key + 1);
    }
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title="Trade Journal"
        subtitle="Capture the setup, execution, psychology and lesson behind every trade. Stored locally in this browser profile."
        action={<div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={exportBackup} className="inline-flex h-8 items-center gap-1.5 rounded-sm border px-2.5 text-xs hover:bg-accent"><Download className="size-3.5" /> Export</button>
          <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-sm border px-2.5 text-xs hover:bg-accent"><FileUp className="size-3.5" /> Import<input key={importInputKey} type="file" accept="application/json,.json" onChange={importBackup} className="hidden" /></label>
          <button type="button" onClick={startNew} className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-primary px-3 text-xs font-semibold text-primary-foreground"><Plus className="size-3.5" /> Log trade</button>
        </div>}
      />

      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        <Metric title="Journaled trades" value={String(stats.total)} />
        <Metric title="Net journal P&L" value={fmtMoney(stats.pnl)} tone={stats.pnl >= 0 ? "positive" : "negative"} />
        <Metric title="Win rate · closed" value={stats.closed ? stats.winRate.toFixed(1) + "%" : "—"} />
        <Metric title="Average R · closed" value={fmtNumber(stats.averageR, "R")} />
      </div>

      <JournalAnalyticsPanel entries={entries} />

      {showForm && <Panel title={editingId ? "Edit journal entry" : "New trade journal"} action={<button type="button" onClick={cancelForm} aria-label="Close journal form" className="p-1 text-muted-foreground hover:text-foreground"><X className="size-4" /></button>}>
        <form onSubmit={submit} className="space-y-4 p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="Trade date" required><input type="date" className={inputClass} value={draft.date} onChange={(e) => setField("date", e.target.value)} required /></Field>
            <Field label="Symbol / instrument" required><input className={inputClass} value={draft.symbol} onChange={(e) => setField("symbol", e.target.value)} placeholder="XAUUSD, NQ, AAPL…" maxLength={32} required /></Field>
            <Field label="Direction"><select className={selectClass} value={draft.side} onChange={(e) => setField("side", e.target.value as JournalSide)}><option value="LONG">Long</option><option value="SHORT">Short</option></select></Field>
            <Field label="Outcome"><select className={selectClass} value={draft.outcome} onChange={(e) => setField("outcome", e.target.value as JournalOutcome)}>{outcomes.map((value) => <option key={value} value={value}>{value === "BREAKEVEN" ? "Break-even" : value.charAt(0) + value.slice(1).toLowerCase()}</option>)}</select></Field>
            <Field label="Setup"><input className={inputClass} value={draft.setup} onChange={(e) => setField("setup", e.target.value)} placeholder="Breakout, reversal, FVG…" maxLength={120} /></Field>
            <Field label="Session"><select className={selectClass} value={draft.session} onChange={(e) => setField("session", e.target.value)}><option value="">Not tagged</option><option>Asia</option><option>London</option><option>New York</option><option>London–New York overlap</option><option>Other</option></select></Field>
            <Field label="Entry price"><input type="number" step="any" className={inputClass} value={draft.entryPrice ?? ""} onChange={(e) => setField("entryPrice", numberField(e.target.value))} /></Field>
            <Field label="Exit price"><input type="number" step="any" className={inputClass} value={draft.exitPrice ?? ""} onChange={(e) => setField("exitPrice", numberField(e.target.value))} /></Field>
            <Field label="Stop loss"><input type="number" step="any" className={inputClass} value={draft.stopLoss ?? ""} onChange={(e) => setField("stopLoss", numberField(e.target.value))} /></Field>
            <Field label="Quantity / size"><input type="number" min="0" step="any" className={inputClass} value={draft.quantity ?? ""} onChange={(e) => setField("quantity", numberField(e.target.value))} /></Field>
            <Field label="Realized P&L (account currency)"><input type="number" step="any" className={inputClass} value={draft.pnl ?? ""} onChange={(e) => setField("pnl", numberField(e.target.value))} placeholder="Use negative for loss" /></Field>
            <Field label="R multiple"><input type="number" step="any" className={inputClass} value={draft.rMultiple ?? ""} onChange={(e) => setField("rMultiple", numberField(e.target.value))} placeholder="e.g. 1.5 or -1" /></Field>
            <Field label="Higher-timeframe bias"><select className={selectClass} value={draft.higherTimeframeBias} onChange={(e) => setField("higherTimeframeBias", e.target.value)}><option value="">Not recorded</option><option>Bullish</option><option>Bearish</option><option>Range / neutral</option><option>Counter-trend</option></select></Field>
            <Field label="Liquidity target"><input className={inputClass} value={draft.liquidityTarget} onChange={(e) => setField("liquidityTarget", e.target.value)} placeholder="PDH, PDL, equal highs…" maxLength={160} /></Field>
            <Field label="Emotion before / during"><input className={inputClass} value={draft.emotion} onChange={(e) => setField("emotion", e.target.value)} placeholder="Calm, FOMO, hesitant…" maxLength={120} /></Field>
            <Field label="Execution quality"><select className={selectClass} value={draft.executionQuality} onChange={(e) => setField("executionQuality", e.target.value)}><option value="">Not rated</option><option>Excellent — followed plan</option><option>Good — minor deviation</option><option>Mixed — avoidable error</option><option>Poor — broke rules</option></select></Field>
            <Field label="Mistake tag"><input className={inputClass} value={draft.mistake} onChange={(e) => setField("mistake", e.target.value)} placeholder="Early entry, overtrading…" maxLength={160} /></Field>
            <Field label="Rule adherence"><select className={selectClass} value={draft.ruleAdherence} onChange={(e) => setField("ruleAdherence", e.target.value)}><option value="">Not recorded</option><option>Followed all rules</option><option>Minor deviation</option><option>Broke a rule</option><option>No written plan</option></select></Field>
          </div>
          <Field label="Confluence tags · comma-separated"><input className={inputClass} value={confluenceText} onChange={(e) => setConfluenceText(e.target.value)} placeholder="HTF alignment, liquidity sweep, MSS/BOS, FVG…" /></Field>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Field label="Trade thesis · why did you take it?"><textarea className={areaClass} value={draft.thesis} onChange={(e) => setField("thesis", e.target.value)} maxLength={4000} placeholder="Context, trigger, invalidation and target…" /></Field>
            <Field label="Notes · what actually happened?"><textarea className={areaClass} value={draft.notes} onChange={(e) => setField("notes", e.target.value)} maxLength={4000} placeholder="Execution details, price behavior, deviations…" /></Field>
            <Field label="Post-trade reflection · what will you repeat or change?"><textarea className={areaClass} value={draft.reflection} onChange={(e) => setField("reflection", e.target.value)} maxLength={4000} placeholder="One lesson and one action for next time…" /></Field>
            <Field label="Chart screenshot · optional">
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-sm border px-3 text-xs hover:bg-accent"><ImagePlus className="size-4" /> Attach chart<input type="file" accept="image/*" onChange={handleScreenshot} className="hidden" /></label>
                <span className="max-w-xs truncate text-[11px] text-muted-foreground">{screenshotName || "Stored locally with this entry"}</span>
                {draft.screenshotData && <button type="button" onClick={removeScreenshot} className="text-xs text-negative">Remove</button>}
              </div>
              {draft.screenshotData && <img src={draft.screenshotData} alt="Attached trade chart" className="mt-2 max-h-48 rounded border object-contain" />}
            </Field>
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
            <button type="button" onClick={cancelForm} className="h-8 rounded-sm border px-3 text-xs">Cancel</button>
            <button type="submit" className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-primary px-3 text-xs font-semibold text-primary-foreground"><Save className="size-3.5" /> {editingId ? "Save changes" : "Save journal entry"}</button>
          </div>
        </form>
      </Panel>}

      <Panel title="Trade history" action={<span className="pr-2 text-[10px] text-muted-foreground">{filtered.length} entries</span>} className="min-h-64">
        <div className="flex flex-wrap gap-2 border-b p-2">
          <div className="relative min-w-40 flex-1"><Search className="absolute left-2 top-2.5 size-3.5 text-muted-foreground" /><input aria-label="Search journal" className={inputClass + " pl-7"} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search symbol, setup, thesis…" /></div>
          <select aria-label="Filter by outcome" className={selectClass + " w-36"} value={outcomeFilter} onChange={(e) => setOutcomeFilter(e.target.value)}><option value="">All outcomes</option>{outcomes.map((value) => <option key={value} value={value}>{value}</option>)}</select>
          <input aria-label="Filter by date" type="date" className={inputClass + " w-36"} value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
          {(search || outcomeFilter || dateFilter) && <button type="button" onClick={() => { setSearch(""); setOutcomeFilter(""); setDateFilter(""); }} className="h-9 rounded-sm border px-2 text-xs">Clear filters</button>}
        </div>
        {!ready ? <div className="p-6 text-xs text-muted-foreground">Loading your local journal…</div>
          : filtered.length === 0 ? <EmptyState title="No journal entries yet" detail="Log your first trade. Your notes stay in this browser and are not sent to the TradeLedger API." />
          : <div className="overflow-auto">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 bg-panel-2"><tr>
                {["Date", "Symbol", "Setup", "Side", "Outcome", "P&L", "R", "Emotion", "Actions"].map((label) => <th key={label} className="whitespace-nowrap px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</th>)}
              </tr></thead>
              <tbody>{filtered.map((entry) => <tr key={entry.id} className="border-t border-border/50 hover:bg-accent/30">
                <td className="whitespace-nowrap px-3 py-2 font-mono text-muted-foreground">{entry.date}</td>
                <td className="px-3 py-2 font-semibold">{entry.symbol}</td>
                <td className="max-w-36 truncate px-3 py-2">{entry.setup || "—"}</td>
                <td className={entry.side === "LONG" ? "px-3 py-2 text-positive" : "px-3 py-2 text-negative"}>{entry.side}</td>
                <td className="px-3 py-2">{entry.outcome}</td>
                <td className={(entry.pnl ?? 0) >= 0 ? "whitespace-nowrap px-3 py-2 text-positive" : "whitespace-nowrap px-3 py-2 text-negative"}>{fmtMoney(entry.pnl)}</td>
                <td className="whitespace-nowrap px-3 py-2">{fmtNumber(entry.rMultiple, "R")}</td>
                <td className="max-w-32 truncate px-3 py-2 text-muted-foreground">{entry.emotion || "—"}</td>
                <td className="whitespace-nowrap px-3 py-2"><div className="flex items-center gap-1">
                  <button type="button" onClick={() => startEdit(entry)} aria-label={"Edit " + entry.symbol + " journal entry"} className="rounded p-1.5 hover:bg-accent"><Pencil className="size-3.5" /></button>
                  <button type="button" onClick={() => removeEntry(entry.id)} aria-label={"Delete " + entry.symbol + " journal entry"} className="rounded p-1.5 text-negative hover:bg-accent"><Trash2 className="size-3.5" /></button>
                </div></td>
              </tr>)}</tbody>
            </table>
            {filtered.map((entry) => <details key={entry.id + "-detail"} className="border-t border-border/50 px-3 py-2">
              <summary className="cursor-pointer text-[11px] text-muted-foreground">{entry.date} · {entry.symbol} — view thesis and review</summary>
              <div className="grid gap-3 py-3 md:grid-cols-2">
                <Detail title="Thesis" value={entry.thesis} />
                <Detail title="Notes" value={entry.notes} />
                <Detail title="Reflection" value={entry.reflection} />
                <Detail title="Confluence" value={entry.confluence.join(" · ")} />
                <Detail title="HTF bias / liquidity" value={[entry.higherTimeframeBias, entry.liquidityTarget].filter(Boolean).join(" · ")} />
                <Detail title="Rule adherence / mistake" value={[entry.ruleAdherence, entry.mistake].filter(Boolean).join(" · ")} />
                {entry.screenshotData && <div><p className="mb-1 text-[10px] uppercase text-muted-foreground">Chart screenshot</p><img src={entry.screenshotData} alt={entry.symbol + " trade chart"} className="max-h-72 rounded border object-contain" /></div>}
              </div>
            </details>)}
          </div>}
      </Panel>
      <p className="text-[10px] text-muted-foreground">Local-first storage: entries remain in this browser profile and are not sent to the API or committed to Git. Browser storage is not encrypted or synced; use a trusted device and export backups regularly.</p>
    </div>
  );
}

function Metric({ title, value, tone }: { title: string; value: string; tone?: "positive" | "negative" }) {
  return <div className="panel p-3"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{title}</p><p className={"mt-1 text-lg font-semibold tabular-nums " + (tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : "")}>{value}</p></div>;
}
function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return <label className="block text-[11px] text-muted-foreground">{label}{required ? " *" : ""}{children}</label>;
}
function Detail({ title, value }: { title: string; value: string }) {
  return <div><p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">{title}</p><p className="whitespace-pre-wrap text-xs">{value || "—"}</p></div>;
}
