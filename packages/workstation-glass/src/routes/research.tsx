import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { api } from "@/api/client";
import { isConfigured, useApiConfig } from "@/api/config";
import { useBacktestRuns, useRunBacktest, useStrategyCatalog } from "@/hooks/use-tradeledger";
import type { BacktestRequest, HistoryCoverage, ResearchRun, StrategyCatalog } from "@/api/types";
import { PageHeader, Panel, DataTable, type Column } from "@/components/terminal/primitives";
import { TIMEFRAMES } from "@/lib/chart-view";
import { daysAgoIso, isoDay, todayIso, validateSpec } from "@/lib/research-view";
import { money, pct, time, tone, UNAVAILABLE } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/research")({
  head: () => ({
    meta: [
      { title: "Research — TradeLedger" },
      { name: "description", content: "Strategy research: declarative backtests over real historical data." },
    ],
  }),
  component: ResearchPage,
});

const DEFAULT_SPEC = `{
  "kind": "sma_crossover",
  "parameters": { "fast": 10, "slow": 30 }
}`;

function ResearchPage() {
  const cfg = useApiConfig();
  const catalogQuery = useStrategyCatalog();
  const runsQuery = useBacktestRuns();
  const runMutation = useRunBacktest();

  const [instrument, setInstrument] = useState("EURUSD");
  const [interval, setIntervalId] = useState("1d");
  const [startDate, setStartDate] = useState(() => daysAgoIso(365));
  const [endDate, setEndDate] = useState(() => todayIso());
  const [specText, setSpecText] = useState(DEFAULT_SPEC);
  const [capital, setCapital] = useState("100000");
  const [quantity, setQuantity] = useState("1");
  const [commission, setCommission] = useState("0");
  const [slippageBps, setSlippageBps] = useState("0");
  const [saveRun, setSaveRun] = useState(true);

  const [result, setResult] = useState<ResearchRun | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [dataset, setDataset] = useState<HistoryCoverage | null>(null);
  const [datasetError, setDatasetError] = useState<string | null>(null);
  const [checkingDataset, setCheckingDataset] = useState(false);
  const [selectedRuns, setSelectedRuns] = useState<string[]>([]);
  const controllerRef = useRef<AbortController | null>(null);

  const catalog = catalogQuery.data;
  const validation = useMemo(() => validateSpec(specText, catalog), [specText, catalog]);
  const datesValid = /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate)
    && Date.parse(isoDay(endDate, true)) > Date.parse(isoDay(startDate));
  const numbersValid = [capital, quantity, commission, slippageBps].every((value) => Number.isFinite(Number(value)))
    && Number(capital) > 0 && Number(quantity) > 0 && Number(commission) >= 0 && Number(slippageBps) >= 0
    && instrument.trim().length > 0;
  const canRun = isConfigured(cfg) && validation.spec !== null && datesValid && numbersValid && !runMutation.isPending;

  const definition = catalog?.strategies.find((item) => item.kind === (validation.spec?.kind ?? ""));

  const checkDataset = async (): Promise<void> => {
    setCheckingDataset(true);
    setDatasetError(null);
    try {
      const history = await api.marketDataHistory(cfg.accountId, instrument.trim().toUpperCase(), interval, isoDay(startDate), isoDay(endDate, true));
      setDataset(history.coverage ?? { count: history.bars.length });
    } catch (error) {
      setDataset(null);
      setDatasetError(error instanceof Error ? error.message : "dataset check failed");
    } finally {
      setCheckingDataset(false);
    }
  };

  const startRun = (): void => {
    if (validation.spec === null) return;
    setRunError(null);
    const controller = new AbortController();
    controllerRef.current = controller;
    const body: BacktestRequest = {
      accountId: cfg.accountId,
      instrumentId: instrument.trim().toUpperCase(),
      interval,
      startAt: isoDay(startDate),
      endAt: isoDay(endDate, true),
      strategy: validation.spec,
      initialCapital: Number(capital),
      quantity: Number(quantity),
      commissionPerTrade: Number(commission),
      slippageBps: Number(slippageBps),
      save: saveRun,
    };
    runMutation.mutate({ body, signal: controller.signal }, {
      onSuccess: (run) => {
        setResult(run);
        setRunError(null);
        toast.success(`Backtest finished: ${run.report.performance.tradeCount} trades, ${pct(run.report.performance.returnPct)}`);
      },
      onError: (error) => {
        const message = error instanceof Error ? error.message : "backtest failed";
        if (message !== "cancelled") {
          setRunError(message);
          toast.error(message);
        }
      },
      onSettled: () => { controllerRef.current = null; },
    });
  };

  const cancelRun = (): void => {
    controllerRef.current?.abort();
  };

  const toggleCompare = (runId: string): void => {
    setSelectedRuns((current) => {
      if (current.includes(runId)) return current.filter((id) => id !== runId);
      if (current.length >= 2) return [current[1]!, runId];
      return [...current, runId];
    });
  };

  const comparedRuns = (runsQuery.data?.runs ?? []).filter((run) => selectedRuns.includes(run.runId));

  return (
    <div>
      <PageHeader
        title="Research"
        subtitle="Declarative strategy backtests executed by the backend over verified provider history. Submitted strategies are specifications, never executed code."
      />

      <div className="grid gap-3 lg:grid-cols-[380px_1fr]">
        <div className="flex flex-col gap-3">
          <Panel title="Backtest setup">
            <div className="flex flex-col gap-2.5 p-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] text-muted-foreground">Instrument
                  <input value={instrument} onChange={(e) => setInstrument(e.target.value.toUpperCase())}
                    className="field-control num mt-1 h-8 w-full" placeholder="EURUSD" />
                </label>
                <label className="text-[11px] text-muted-foreground">Timeframe
                  <select value={interval} onChange={(e) => setIntervalId(e.target.value)} className="field-control num mt-1 h-8 w-full">
                    {TIMEFRAMES.map((tf) => (
                      <option key={tf.id} value={tf.interval}>{tf.label} {tf.aggregated ? "(aggregated)" : ""}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] text-muted-foreground">Start date
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="field-control num mt-1 h-8 w-full" />
                </label>
                <label className="text-[11px] text-muted-foreground">End date
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="field-control num mt-1 h-8 w-full" />
                </label>
              </div>
              {!datesValid ? (
                <p role="alert" className="text-[10px] text-negative">End date must be after the start date.</p>
              ) : null}

              <div className="border-t pt-2 text-[11px] text-muted-foreground">
                <div className="flex items-center justify-between gap-2">
                  <span className="label-caps">Dataset availability</span>
                  <button type="button" onClick={() => void checkDataset()} disabled={checkingDataset || !datesValid || !isConfigured(cfg)}
                    className="h-6 rounded-sm border px-2 text-[10px] disabled:opacity-40">
                    {checkingDataset ? "Checking…" : "Check data"}
                  </button>
                </div>
                {dataset ? (
                  <p className="num mt-1 text-foreground">
                    {dataset.count === 0 ? "No candles in this window from this provider." : `${dataset.count} candles · ${dataset.returnedFrom} → ${dataset.returnedTo}`}
                  </p>
                ) : null}
                {datasetError ? <p className="mt-1 text-negative">{datasetError}</p> : null}
                {!dataset && !datasetError ? <p className="mt-1">Not checked yet — the run also reports the exact range it used.</p> : null}
              </div>

              <div className="grid grid-cols-4 gap-2 border-t pt-2">
                {([
                  ["Capital", capital, setCapital],
                  ["Qty", quantity, setQuantity],
                  ["Fee/trade", commission, setCommission],
                  ["Slip bps", slippageBps, setSlippageBps],
                ] as const).map(([label, value, setter]) => (
                  <label key={label} className="text-[10px] text-muted-foreground">{label}
                    <input inputMode="decimal" value={value} onChange={(e) => setter(e.target.value)}
                      className="field-control num mt-1 h-7 w-full" />
                  </label>
                ))}
              </div>
              {!numbersValid ? (
                <p role="alert" className="text-[10px] text-negative">Capital and quantity must be positive; fees and slippage must not be negative; an instrument is required.</p>
              ) : null}

              <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <input type="checkbox" checked={saveRun} onChange={(e) => setSaveRun(e.target.checked)} />
                Save this run to the research log
              </label>
            </div>
          </Panel>

          <Panel title="Strategy source">
            <div className="flex flex-col gap-2 p-3">
              <textarea
                value={specText}
                onChange={(e) => setSpecText(e.target.value)}
                spellCheck={false}
                aria-label="Strategy specification (JSON)"
                className="field-control num h-40 w-full resize-y p-2 text-[11px] leading-relaxed"
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
              {definition ? <p className="text-[10px] leading-snug text-muted-foreground">{definition.description}</p> : null}
              {definition && definition.parameters.length > 0 ? (
                <ul className="mt-0.5 space-y-0.5 text-[10px] text-muted-foreground">
                  {definition.parameters.map((param) => (
                    <li key={param.key}>
                      <span className="num text-foreground">{param.key}</span> — {param.help} <span className="num">[{param.min}…{param.max}, default {param.default}]</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-3">
          <Panel
            title="Run"
            action={
              <div className="flex items-center gap-2">
                {runMutation.isPending ? (
                  <button type="button" onClick={cancelRun} className="h-7 rounded-sm border border-negative/50 px-3 text-[11px] text-negative">
                    Cancel
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={startRun}
                  disabled={!canRun}
                  className="h-7 rounded-sm bg-primary px-4 text-[12px] font-semibold text-primary-foreground disabled:opacity-40"
                >
                  {runMutation.isPending ? "Running…" : "Run backtest"}
                </button>
              </div>
            }
          >
            <div className="flex flex-col gap-2 p-3 text-[11px]">
              {!isConfigured(cfg) ? (
                <p className="text-warning">Connect the API in Settings to run research.</p>
              ) : runMutation.isPending ? (
                <p className="text-muted-foreground">Running {instrument} {interval} with {validation.spec?.kind ?? ""}… signals execute at the next bar open.</p>
              ) : runError ? (
                <p role="alert" className="border border-negative/35 bg-negative/8 px-2 py-1.5 text-negative">{runError}</p>
              ) : (
                <p className="text-muted-foreground">
                  Execution model: signals computed on bar N fill at bar N+1 open, with configured fee and slippage. Results are deterministic for identical inputs.
                </p>
              )}
            </div>
          </Panel>

          {result ? <ResultPanel run={result} /> : (
            <Panel title="Results">
              <div className="flex min-h-40 flex-col items-start justify-center gap-2 p-4">
                <p className="text-[13px] font-medium">No run selected</p>
                <p className="type-meta max-w-xl">
                  Configure an instrument, timeframe, date range and strategy specification, then run a backtest.
                  Results show metrics, the equity curve, trade-by-trade fills and the exact provider data range used.
                </p>
              </div>
            </Panel>
          )}

          <Panel
            title="Saved runs"
            action={<span className="text-[10px] text-muted-foreground">{runsQuery.data?.runs.length ?? 0} saved</span>}
          >
            {runsQuery.isError ? (
              <p className="p-3 text-[11px] text-negative">{runsQuery.error instanceof Error ? runsQuery.error.message : "could not load runs"}</p>
            ) : (runsQuery.data?.runs.length ?? 0) === 0 ? (
              <p className="p-3 text-[11px] text-muted-foreground">No saved research runs yet. Tick “Save this run” to keep one for comparison.</p>
            ) : (
              <div className="p-3">
                <div className="flex flex-col divide-y divide-border/50">
                  {runsQuery.data!.runs.map((run) => (
                    <div key={run.runId} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-[11px]">
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" checked={selectedRuns.includes(run.runId)} onChange={() => toggleCompare(run.runId)} />
                        <span className="text-muted-foreground">compare</span>
                      </label>
                      <span className="num">{time(run.createdAt)}</span>
                      <span className="num font-semibold">{run.instrumentId}</span>
                      <span className="num text-muted-foreground">{run.interval}</span>
                      <span className="num">{run.strategy.kind} v{run.strategy.version}</span>
                      <span className="num">{run.report.performance.tradeCount} trades</span>
                      <span className={cn("num font-semibold", tone(run.report.performance.returnPct))}>{pct(run.report.performance.returnPct * 100)}</span>
                      <span className="num text-muted-foreground">dd {pct(-run.report.performance.maxDrawdownPct * 100)}</span>
                      <button
                        type="button"
                        onClick={() => { setResult(run); setRunError(null); }}
                        className="ml-auto h-6 rounded-sm border px-2 text-[10px] hover:border-primary"
                      >
                        View
                      </button>
                    </div>
                  ))}
                </div>
                {comparedRuns.length === 2 ? <ComparisonTable runs={comparedRuns} /> : (
                  <p className="mt-2 text-[10px] text-muted-foreground">Select two runs to compare them side by side.</p>
                )}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function ResultPanel({ run }: { run: ResearchRun }) {
  const metrics = run.report.performance;
  const tradeColumns: Column<ResearchRun["trades"][number]>[] = [
    { key: "entryAt", header: "Entry", cell: (t) => <span className="num">{time(t.entryAt)}</span> },
    { key: "exitAt", header: "Exit", cell: (t) => <span className="num">{time(t.exitAt)}</span> },
    { key: "side", header: "Side", cell: (t) => <span className={cn("num font-semibold", t.side === "long" ? "text-positive" : "text-negative")}>{t.side.toUpperCase()}</span> },
    { key: "entryPrice", header: "Entry px", align: "right", cell: (t) => <span className="num">{t.entryPrice}</span> },
    { key: "exitPrice", header: "Exit px", align: "right", cell: (t) => <span className="num">{t.exitPrice}</span> },
    { key: "quantity", header: "Qty", align: "right", cell: (t) => <span className="num">{t.quantity}</span> },
    { key: "pnl", header: "P&L", align: "right", cell: (t) => <span className={cn("num", tone(t.pnl))}>{money(t.pnl, true)}</span> },
  ];
  const finite = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value);
  const cells: Array<{ label: string; value: string; cls?: string }> = [
    { label: "Total return", value: pct(metrics.returnPct * 100), cls: tone(metrics.returnPct) },
    { label: "Net P&L", value: money(metrics.netPnl, true), cls: tone(metrics.netPnl) },
    { label: "Max drawdown", value: pct(-metrics.maxDrawdownPct * 100), cls: "text-negative" },
    { label: "Win rate", value: pct(metrics.winRatePct * 100) },
    { label: "Trades", value: String(metrics.tradeCount) },
    { label: "Profit factor", value: finite(metrics.profitFactor) ? metrics.profitFactor.toFixed(2) : UNAVAILABLE },
    { label: "Risk-adj. (sharpe-like)", value: finite(metrics.sharpeLike) ? metrics.sharpeLike.toFixed(2) : UNAVAILABLE },
    { label: "Best / worst trade", value: `${money(run.report.robustness.bestTrade, true)} / ${money(run.report.robustness.worstTrade, true)}` },
  ];

  return (
    <div className="flex flex-col gap-3">
      <Panel
        title={`${run.instrumentId} · ${run.interval} · ${run.strategy.name} v${run.strategy.version}`}
        action={<span className="text-[10px] text-muted-foreground">run {run.runId.slice(0, 8)} · {time(run.createdAt)}</span>}
      >
        <div className="p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {cells.map((cell) => (
              <div key={cell.label} className="border border-border bg-background/40 px-2 py-1.5">
                <div className="label-caps">{cell.label}</div>
                <div className={cn("num mt-0.5 text-sm font-semibold", cell.cls)}>{cell.value}</div>
              </div>
            ))}
          </div>

          <div className="mt-2 grid gap-1 text-[10px] text-muted-foreground sm:grid-cols-2">
            <span className="num">
              Data: {run.dataRange.count} bars · {run.dataRange.from} → {run.dataRange.to}{run.dataRange.source ? ` · ${run.dataRange.source}` : ""}
            </span>
            <span className="num">
              Capital {money(run.assumptions.initialCapital)} · qty {run.assumptions.quantity} · fee {money(run.assumptions.commissionPerTrade)}/trade · slip {run.assumptions.slippageBps} bps · fill {run.assumptions.execution}
            </span>
          </div>

          {run.warnings.length > 0 ? (
            <ul className="mt-2 border border-warning/35 bg-warning/8 px-2 py-1.5 text-[10px] leading-snug text-warning">
              {run.warnings.map((warning) => <li key={warning}>• {warning}</li>)}
            </ul>
          ) : null}

          <div className="mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={run.equityCurve} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="at" minTickGap={60} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false}
                  tickFormatter={(value: string) => String(value).slice(0, 10)} />
                <YAxis orientation="right" width={80} tickFormatter={(value: number) => money(Number(value))}
                  tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", fontSize: 11 }}
                  labelStyle={{ color: "var(--muted-foreground)" }}
                  formatter={(value: number | string) => [money(Number(value)), "Equity"]}
                />
                <Line type="monotone" dataKey="equity" stroke="var(--primary)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Panel>

      <Panel title={`Trades (${run.trades.length})`}>
        <div className="max-h-72 overflow-auto">
          {run.trades.length === 0 ? (
            <p className="p-3 text-[11px] text-muted-foreground">The strategy produced no trades in this range.</p>
          ) : (
            <DataTable rows={[...run.trades]} columns={tradeColumns} rowKey={(t) => t.entryAt} />
          )}
        </div>
      </Panel>
    </div>
  );
}

function ComparisonTable({ runs }: { runs: ResearchRun[] }) {
  const [left, right] = runs as [ResearchRun, ResearchRun];
  const rows: Array<[string, (run: ResearchRun) => string]> = [
    ["Created", (run) => time(run.createdAt)],
    ["Instrument", (run) => `${run.instrumentId} ${run.interval}`],
    ["Strategy", (run) => `${run.strategy.kind} v${run.strategy.version} ${JSON.stringify(run.strategy.parameters)}`],
    ["Bars", (run) => `${run.dataRange.count} (${run.dataRange.from} → ${run.dataRange.to})`],
    ["Total return", (run) => pct(run.report.performance.returnPct * 100)],
    ["Net P&L", (run) => money(run.report.performance.netPnl, true)],
    ["Max drawdown", (run) => pct(-run.report.performance.maxDrawdownPct * 100)],
    ["Win rate", (run) => pct(run.report.performance.winRatePct * 100)],
    ["Trades", (run) => String(run.report.performance.tradeCount)],
    ["Profit factor", (run) => Number.isFinite(run.report.performance.profitFactor) ? run.report.performance.profitFactor.toFixed(2) : UNAVAILABLE],
    ["Risk-adj.", (run) => Number.isFinite(run.report.performance.sharpeLike) ? run.report.performance.sharpeLike.toFixed(2) : UNAVAILABLE],
  ];
  return (
    <div className="mt-3 overflow-x-auto border-t pt-2">
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
  );
}