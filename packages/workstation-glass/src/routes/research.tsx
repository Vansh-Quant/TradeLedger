import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { z } from "zod";
import { api } from "@/api/client";
import { isConfigured, useApiConfig } from "@/api/config";
import type { HistoryCoverage, ResearchRun } from "@/api/types";
import {
  DataTable, EmptyState, ErrorState, LoadingState, PageHeader, Panel, type Column,
} from "@/components/terminal/primitives";
import { useBacktestRuns, useStrategyCatalog } from "@/hooks/use-tradeledger";
import { TIMEFRAMES } from "@/lib/chart-view";
import { money, pct, time, tone, UNAVAILABLE } from "@/lib/format";
import {
  DEFAULT_SPEC, compareRuns, filterRuns, specJsonFor, validateSpec,
} from "@/lib/research-view";
import { cn } from "@/lib/utils";

const TABS = ["research", "library", "builder", "experiments"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  research: "Research",
  library: "Strategy Library",
  builder: "Builder",
  experiments: "Experiments",
};

export const Route = createFileRoute("/research")({
  validateSearch: z.object({
    tab: z.enum(TABS).optional(),
    /** Strategy specification handed over from the Backtesting terminal. */
    spec: z.string().optional(),
  }),
  head: () => ({
    meta: [
      { title: "Research — TradeLedger" },
      { name: "description", content: "Combined research workspace: experiment log, strategy library, builder and run comparison." },
    ],
  }),
  component: ResearchPage,
});

function ResearchPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/research" });
  const active: Tab = search.tab ?? "research";
  const setTab = (tab: Tab) => navigate({ search: (prev) => ({ ...prev, tab }), replace: true });

  return (
    <div>
      <PageHeader
        title="Research"
        subtitle="Idea → experiment → run: a strategy is specified in the Builder, executed as an experiment in Backtesting, and its persisted run is logged and compared here."
      />

      <div className="mb-3 flex flex-wrap gap-1 border-b border-border pb-1" role="tablist" aria-label="Research workspace">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={active === tab}
            onClick={() => setTab(tab)}
            className={cn(
              "rounded-sm px-3 py-1.5 text-[12px] font-medium transition-colors",
              active === tab
                ? "bg-accent text-foreground shadow-[inset_0_-2px_0_var(--primary)]"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {active === "research" ? <ResearchLog /> : null}
      {active === "library" ? <StrategyLibrary /> : null}
      {active === "builder" ? <Builder initialSpec={search.spec} /> : null}
      {active === "experiments" ? <Experiments /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ Research */

function ResearchLog() {
  const runsQuery = useBacktestRuns();
  const [query, setQuery] = useState("");
  const [instrument, setInstrument] = useState("all");

  const runs = useMemo(() => runsQuery.data?.runs ?? [], [runsQuery.data]);
  const instruments = useMemo(() => [...new Set(runs.map((run) => run.instrumentId))].sort(), [runs]);
  const filtered = useMemo(() => {
    const byInstrument = instrument === "all" ? runs : runs.filter((run) => run.instrumentId === instrument);
    return filterRuns(byInstrument, query);
  }, [runs, instrument, query]);

  const columns: Column<ResearchRun>[] = [
    { key: "created", header: "Created", cell: (r) => <span className="num text-muted-foreground">{time(r.createdAt)}</span> },
    { key: "instrument", header: "Instrument", cell: (r) => <span className="font-semibold">{r.instrumentId}</span> },
    { key: "interval", header: "Timeframe", cell: (r) => <span className="num">{r.interval}</span> },
    { key: "strategy", header: "Strategy", cell: (r) => <span className="num">{r.strategy.kind} v{r.strategy.version}</span> },
    { key: "bars", header: "Bars", align: "right", cell: (r) => <span className="num">{r.dataRange.count}</span> },
    { key: "trades", header: "Trades", align: "right", cell: (r) => <span className="num">{r.report.performance.tradeCount}</span> },
    {
      key: "return",
      header: "Return",
      align: "right",
      cell: (r) => (
        <span className={cn("num font-semibold", tone(r.report.performance.returnPct))}>
          {pct(r.report.performance.returnPct * 100)}
        </span>
      ),
    },
    {
      key: "dd",
      header: "Max DD",
      align: "right",
      cell: (r) => <span className="num text-negative">{pct(-r.report.performance.maxDrawdownPct * 100)}</span>,
    },
    {
      key: "open",
      header: "",
      align: "right",
      cell: (r) => (
        <Link to="/backtesting" search={{ run: r.runId }} className="text-[11px] text-primary hover:underline">
          Analyse
        </Link>
      ),
    },
  ];

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
      <Panel
        title="Experiment log"
        action={<span className="text-[10px] text-muted-foreground">{filtered.length} of {runs.length} runs</span>}
      >
        <div className="flex flex-wrap items-center gap-2 border-b p-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search runs: symbol, strategy, timeframe, date…"
            aria-label="Search research runs"
            className="field-control h-7 min-w-52 flex-1 text-[11px]"
          />
          <select
            value={instrument}
            onChange={(e) => setInstrument(e.target.value)}
            aria-label="Filter by instrument"
            className="field-control num h-7 w-auto text-[11px]"
          >
            <option value="all">All instruments</option>
            {instruments.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </div>
        <div className="max-h-[60vh] overflow-auto">
          {runsQuery.isPending && runsQuery.fetchStatus === "idle" ? (
            <EmptyState title="Not connected to TradeLedger API" detail="Set the API base URL, account and token in Settings." />
          ) : runsQuery.isLoading ? (
            <LoadingState label="Loading runs" />
          ) : runsQuery.error ? (
            <ErrorState error={runsQuery.error} />
          ) : runs.length === 0 ? (
            <EmptyState
              title="No research runs yet"
              detail="Run a backtest from the Backtesting terminal with “Save run” enabled; every persisted run then appears here with its exact parameters and coverage."
            />
          ) : filtered.length === 0 ? (
            <EmptyState title="No matching runs" detail={`Nothing matches “${query}”.`} />
          ) : (
            <DataTable rows={filtered} columns={columns} rowKey={(r) => r.runId} />
          )}
        </div>
      </Panel>

      <div className="flex flex-col gap-3">
        <Panel title="Workflow">
          <ol className="flex flex-col gap-2 p-3 text-[11px] leading-snug text-muted-foreground">
            <li>
              <span className="font-semibold text-foreground">1. Idea</span><br />
              Draft and validate a declarative specification in the{" "}
              <Link to="/research" search={{ tab: "builder" }} className="text-primary underline-offset-2 underline">Builder</Link>.
            </li>
            <li>
              <span className="font-semibold text-foreground">2. Experiment</span><br />
              Choose instrument, timeframe, range and assumptions in{" "}
              <Link to="/backtesting" className="text-primary underline-offset-2 underline">Backtesting</Link> and execute it.
            </li>
            <li>
              <span className="font-semibold text-foreground">3. Run</span><br />
              The persisted run lands in this log, then gets analysed or compared against another run.
            </li>
          </ol>
        </Panel>
        <Panel title="Coverage note">
          <p className="p-3 text-[11px] leading-relaxed text-muted-foreground">
            Every row is a record the backend actually persisted — nothing on this page is synthesised. Executed
            coverage can be shorter than the requested window when the provider has less history; the bar count and
            date range are shown per run so that is always visible.
          </p>
        </Panel>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- Library */

function StrategyLibrary() {
  const catalogQuery = useStrategyCatalog();
  const strategies = catalogQuery.data?.strategies ?? [];

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
      <Panel
        title="Strategy catalog"
        action={<span className="text-[10px] text-muted-foreground">GET /api/v1/research/strategies</span>}
      >
        {catalogQuery.isError ? (
          <EmptyState
            title="Strategy catalog unavailable"
            detail={
              catalogQuery.error instanceof Error
                ? `${catalogQuery.error.message} The catalog is static capability metadata, so this usually means the API is not reachable from this browser session.`
                : "The backend did not return the catalog."
            }
          />
        ) : catalogQuery.isLoading ? (
          <LoadingState label="Loading catalog" />
        ) : strategies.length === 0 ? (
          <EmptyState title="No strategy definitions" detail="The backend reported no strategy definitions." />
        ) : (
          <div className="grid gap-3 p-3 md:grid-cols-2">
            {strategies.map((strategy) => (
              <div key={strategy.kind} className="border border-border bg-background/40 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-semibold">{strategy.name}</span>
                  <span className="num text-[10px] text-muted-foreground">{strategy.kind}</span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{strategy.description}</p>
                {strategy.parameters.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-[10px] text-muted-foreground">
                    {strategy.parameters.map((param) => (
                      <li key={param.key} className="leading-snug">
                        <span className="num text-foreground">{param.key}</span>
                        {" — "}{param.help}
                        {" "}<span className="num">[{param.min}…{param.max}{param.integer ? ", integer" : ""}, default {param.default}]</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-[10px] text-muted-foreground">No parameters.</p>
                )}
                <div className="mt-2 flex gap-3 text-[10px]">
                  <Link to="/research" search={{ tab: "builder", spec: specJsonFor(strategy) }} className="text-primary underline-offset-2 underline">
                    Load in Builder
                  </Link>
                  <Link to="/backtesting" search={{ spec: specJsonFor(strategy) }} className="text-primary underline-offset-2 underline">
                    Open in Backtesting
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="flex flex-col gap-3">
        <Panel title="How strategies run">
          <div className="flex flex-col gap-2 p-3 text-[11px] leading-relaxed text-muted-foreground">
            <p>
              Every run validates a submitted specification against this catalog, fetches real historical bars for the
              chosen instrument and timeframe, and executes determinically: a signal computed on bar N fills at bar
              N+1&apos;s open with the configured fee and slippage. There is no code execution path in the API.
            </p>
            <p>
              A persisted strategy registry does not exist yet — saved research runs record the specification and
              version they executed, so runs stay reproducible. Lifecycle status is therefore derived from those runs,
              never asserted as “deployed” or “allocated”.
            </p>
          </div>
        </Panel>
        <Panel title="Next step">
          <p className="p-3 text-[11px] leading-relaxed text-muted-foreground">
            Load a definition into the{" "}
            <Link to="/research" search={{ tab: "builder" }} className="text-primary underline-offset-2 underline">Builder</Link>{" "}
            to tune its parameters, or take it straight to{" "}
            <Link to="/backtesting" className="text-primary underline-offset-2 underline">Backtesting</Link>.
          </p>
        </Panel>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- Builder */

function Builder({ initialSpec }: { initialSpec: string | undefined }) {
  const cfg = useApiConfig();
  const catalogQuery = useStrategyCatalog();
  const catalog = catalogQuery.data;

  const [specText, setSpecText] = useState(initialSpec ?? DEFAULT_SPEC);
  const [instrument, setInstrument] = useState("EURUSD");
  const [interval, setIntervalId] = useState("1d");
  const [dataset, setDataset] = useState<HistoryCoverage | null>(null);
  const [datasetError, setDatasetError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const validation = useMemo(() => validateSpec(specText, catalog), [specText, catalog]);
  const definition = catalog?.strategies.find((item) => item.kind === (validation.spec?.kind ?? ""));

  const checkDataset = async (): Promise<void> => {
    setChecking(true);
    setDatasetError(null);
    const start = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
    const end = new Date().toISOString().slice(0, 10);
    try {
      const history = await api.marketDataHistory(
        cfg.accountId,
        instrument.trim().toUpperCase(),
        interval,
        `${start}T00:00:00.000Z`,
        `${end}T23:59:59.999Z`,
      );
      setDataset(history.coverage ?? { count: history.bars.length });
    } catch (error) {
      setDataset(null);
      setDatasetError(error instanceof Error ? error.message : "dataset check failed");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Panel
        title="Strategy specification"
        action={<span className="text-[10px] text-muted-foreground">declarative JSON · never executed as code</span>}
      >
        <div className="flex flex-col gap-2 p-3">
          <textarea
            value={specText}
            onChange={(e) => setSpecText(e.target.value)}
            spellCheck={false}
            aria-label="Strategy specification (JSON)"
            className="field-control num h-64 w-full resize-y p-2 text-[11px] leading-relaxed"
          />
          {validation.error ? (
            <p role="alert" className="border border-negative/35 bg-negative/8 px-2 py-1.5 text-[10px] leading-snug text-negative">
              {validation.error}
            </p>
          ) : (
            <p className="text-[10px] text-positive">
              Valid specification{definition ? ` — ${definition.name}` : ""}. The backend re-validates before running.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px]">
            <Link
              to="/backtesting"
              search={{ spec: specText }}
              className={cn(
                "rounded-sm bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground",
                validation.spec === null && "pointer-events-none opacity-40",
              )}
            >
              Open in Backtesting
            </Link>
            <button type="button" onClick={() => setSpecText(DEFAULT_SPEC)} className="rounded-sm border px-3 py-1.5 text-[12px]">
              Reset
            </button>
          </div>
        </div>
      </Panel>

      <div className="flex flex-col gap-3">
        <Panel title="Parameters">
          {catalogQuery.isLoading ? (
            <LoadingState label="Loading catalog" />
          ) : definition === undefined ? (
            <EmptyState
              title="Select a known strategy kind"
              detail={validation.error ?? "The catalog could not be loaded, so parameters cannot be described."}
            />
          ) : (
            <div className="p-3">
              <p className="text-[11px] leading-snug text-muted-foreground">{definition.description}</p>
              {definition.parameters.length > 0 ? (
                <ul className="mt-2 space-y-1.5 text-[10px] text-muted-foreground">
                  {definition.parameters.map((param) => (
                    <li key={param.key} className="leading-snug">
                      <span className="num text-foreground">{param.key}</span> — {param.help}
                      <br />
                      <span className="num">[{param.min}…{param.max}{param.integer ? ", integer" : ""}, default {param.default}]</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[10px] text-muted-foreground">This strategy takes no parameters.</p>
              )}
            </div>
          )}
        </Panel>

        <Panel title="Data requirements">
          <div className="flex flex-col gap-2 p-3 text-[11px]">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-muted-foreground">Instrument
                <input
                  value={instrument}
                  onChange={(e) => setInstrument(e.target.value.toUpperCase())}
                  className="field-control num mt-1 h-8 w-full"
                  placeholder="EURUSD"
                />
              </label>
              <label className="text-[11px] text-muted-foreground">Timeframe
                <select value={interval} onChange={(e) => setIntervalId(e.target.value)} className="field-control num mt-1 h-8 w-full">
                  {TIMEFRAMES.map((tf) => (
                    <option key={tf.id} value={tf.interval}>{tf.label}{tf.aggregated ? " (agg)" : ""}</option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              onClick={() => void checkDataset()}
              disabled={checking || !isConfigured(cfg)}
              className="h-7 rounded-sm border px-2 text-[11px] disabled:opacity-40"
            >
              {checking ? "Checking…" : "Check 12-month coverage"}
            </button>
            {dataset ? (
              <p className="num text-foreground">
                {dataset.count === 0
                  ? "No candles in the last 12 months from this provider."
                  : `${dataset.count} candles · ${dataset.returnedFrom ?? "—"} → ${dataset.returnedTo ?? "—"}`}
              </p>
            ) : null}
            {datasetError ? <p className="text-negative">{datasetError}</p> : null}
            {!dataset && !datasetError ? (
              <p className="text-muted-foreground">
                Date range, capital, fees and slippage are chosen when the experiment runs in Backtesting.
              </p>
            ) : null}
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- Experiments */

function Experiments() {
  const runsQuery = useBacktestRuns();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const runs = useMemo(() => runsQuery.data?.runs ?? [], [runsQuery.data]);
  const selected = useMemo(
    () => selectedIds.map((id) => runs.find((run) => run.runId === id)).filter((run): run is ResearchRun => run !== undefined),
    [selectedIds, runs],
  );
  const verdict = selected.length === 2 ? compareRuns(selected[0]!, selected[1]!) : null;

  const toggle = (runId: string): void => {
    setSelectedIds((current) => {
      if (current.includes(runId)) return current.filter((id) => id !== runId);
      if (current.length >= 2) return [current[1]!, runId];
      return [...current, runId];
    });
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[300px_minmax(0,1fr)]">
      <Panel
        title="Select runs"
        action={<span className="text-[10px] text-muted-foreground">{selected.length}/2 selected</span>}
      >
        <div className="max-h-[60vh] overflow-auto">
          {runsQuery.isLoading ? (
            <LoadingState label="Loading runs" />
          ) : runsQuery.error ? (
            <ErrorState error={runsQuery.error} />
          ) : runs.length === 0 ? (
            <EmptyState
              title="No runs to compare"
              detail="Saved research runs appear here once a backtest completes with “Save run” enabled."
            />
          ) : (
            <ul className="divide-y divide-border/50">
              {runs.map((run) => (
                <li key={run.runId}>
                  <label className="flex cursor-pointer items-start gap-2 px-3 py-2 hover:bg-accent/60">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(run.runId)}
                      onChange={() => toggle(run.runId)}
                      className="mt-1"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="num text-[12px] font-semibold">{run.instrumentId}</span>
                        <span className="num text-[10px] text-muted-foreground">{time(run.createdAt)}</span>
                      </span>
                      <span className="num block text-[10px] text-muted-foreground">
                        {run.interval} · {run.strategy.kind} v{run.strategy.version} · {run.dataRange.count} bars
                      </span>
                      <span className={cn("num text-[11px]", tone(run.report.performance.returnPct))}>
                        {pct(run.report.performance.returnPct * 100)}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      <div className="flex min-w-0 flex-col gap-3">
        {selected.length < 2 ? (
          <Panel title="Comparison">
            <EmptyState
              title={selected.length === 1 ? "Select one more run" : "Select two runs"}
              detail="Runs are compared side by side with their exact parameters, versions, data coverage and assumptions."
            />
          </Panel>
        ) : (
          <>
            <Panel title="Compatibility">
              <div className="p-3 text-[11px]">
                {verdict?.comparable ? (
                  <p className="text-positive">
                    Comparable — strategy, version, instrument, timeframe, parameters and execution assumptions match.
                  </p>
                ) : (
                  <div className="border border-warning/35 bg-warning/8 px-2 py-1.5">
                    <p className="font-semibold text-warning">Not a like-for-like comparison</p>
                    <ul className="mt-1 list-disc pl-4 text-warning">
                      {verdict?.blocking.map((issue) => <li key={issue}>{issue}</li>)}
                    </ul>
                  </div>
                )}
                {verdict && verdict.notes.length > 0 ? (
                  <ul className="mt-2 list-disc pl-4 text-muted-foreground">
                    {verdict.notes.map((note) => <li key={note}>{note}</li>)}
                  </ul>
                ) : null}
              </div>
            </Panel>
            <ComparisonTable runs={selected} />
          </>
        )}
      </div>
    </div>
  );
}

function ComparisonTable({ runs }: { runs: ResearchRun[] }) {
  const [left, right] = runs as [ResearchRun, ResearchRun];
  const rows: Array<[string, (run: ResearchRun) => string]> = [
    ["Created", (run) => time(run.createdAt)],
    ["Instrument", (run) => `${run.instrumentId} ${run.interval}`],
    ["Strategy", (run) => `${run.strategy.kind} v${run.strategy.version} ${JSON.stringify(run.strategy.parameters)}`],
    ["Requested window", (run) => `${run.requested.from} → ${run.requested.to}`],
    ["Bars", (run) => `${run.dataRange.count} (${run.dataRange.from} → ${run.dataRange.to})`],
    ["Total return", (run) => pct(run.report.performance.returnPct * 100)],
    ["Net P&L", (run) => money(run.report.performance.netPnl, true)],
    ["Max drawdown", (run) => pct(-run.report.performance.maxDrawdownPct * 100)],
    ["Win rate", (run) => pct(run.report.performance.winRatePct * 100)],
    ["Trades", (run) => String(run.report.performance.tradeCount)],
    ["Profit factor", (run) => Number.isFinite(run.report.performance.profitFactor) ? run.report.performance.profitFactor.toFixed(2) : UNAVAILABLE],
    ["Risk-adj.", (run) => Number.isFinite(run.report.performance.sharpeLike) ? run.report.performance.sharpeLike.toFixed(2) : UNAVAILABLE],
    [
      "Assumptions",
      (run) => `${money(run.assumptions.initialCapital)} · qty ${run.assumptions.quantity} · fee ${money(run.assumptions.commissionPerTrade)} · slip ${run.assumptions.slippageBps}bps`,
    ],
  ];
  return (
    <Panel
      title="Side by side"
      action={<span className="num text-[10px] text-muted-foreground">{left.runId.slice(0, 8)} vs {right.runId.slice(0, 8)}</span>}
    >
      <div className="overflow-x-auto p-3">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 pr-3 font-normal">Metric</th>
              <th className="py-1 pr-3 font-normal">Run {left.runId.slice(0, 8)}</th>
              <th className="py-1 font-normal">Run {right.runId.slice(0, 8)}</th>
            </tr>
          </thead>
          <tbody className="num">
            {rows.map(([label, render]) => (
              <tr key={label} className="border-t border-border/50">
                <td className="py-1 pr-3 text-muted-foreground">{label}</td>
                <td className="py-1 pr-3">{render(left)}</td>
                <td className="py-1">{render(right)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
