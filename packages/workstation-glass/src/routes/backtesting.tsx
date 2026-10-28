import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "@/api/client";
import { isConfigured, useApiConfig } from "@/api/config";
import type { BacktestRequest, HistoryCoverage, ResearchRun } from "@/api/types";
import {
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Panel,
  type Column,
} from "@/components/terminal/primitives";
import { useBacktestRuns, useRunBacktest, useStrategyCatalog } from "@/hooks/use-tradeledger";
import { TIMEFRAMES } from "@/lib/chart-view";
import { money, pct, time, tone, UNAVAILABLE } from "@/lib/format";
import {
  DEFAULT_SPEC,
  daysAgoIso,
  filterRuns,
  isoDay,
  specJsonFor,
  todayIso,
  validateSpec,
} from "@/lib/research-view";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/backtesting")({
  validateSearch: z.object({
    /** Run to open in the analysis column. */
    run: z.string().optional(),
    /** Strategy specification handed over from the Builder. */
    spec: z.string().optional(),
  }),
  head: () => ({
    meta: [
      { title: "Backtesting — TradeLedger" },
      {
        name: "description",
        content: "Run declarative backtests over verified provider history and analyse saved runs.",
      },
    ],
  }),
  component: BacktestingPage,
});

type RunState = "idle" | "running" | "complete" | "failed";

const STATE_STYLE: Record<RunState, string> = {
  idle: "border-border text-muted-foreground",
  running: "border-warning/40 text-warning",
  complete: "border-positive/40 text-positive",
  failed: "border-negative/40 text-negative",
};

function BacktestingPage() {
  const search = Route.useSearch();
  const cfg = useApiConfig();
  const catalogQuery = useStrategyCatalog();
  const runsQuery = useBacktestRuns();
  const runMutation = useRunBacktest();

  const [instrument, setInstrument] = useState("EURUSD");
  const [interval, setIntervalId] = useState("1d");
  const [startDate, setStartDate] = useState(() => daysAgoIso(365));
  const [endDate, setEndDate] = useState(() => todayIso());
  const [specText, setSpecText] = useState(search.spec ?? DEFAULT_SPEC);
  const [capital, setCapital] = useState("100000");
  const [quantity, setQuantity] = useState("1");
  const [commission, setCommission] = useState("0");
  const [slippageBps, setSlippageBps] = useState("0");
  const [saveRun, setSaveRun] = useState(true);

  const [result, setResult] = useState<ResearchRun | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(search.run ?? null);
  const [historyQuery, setHistoryQuery] = useState("");
  const [dataset, setDataset] = useState<HistoryCoverage | null>(null);
  const [datasetError, setDatasetError] = useState<string | null>(null);
  const [checkingDataset, setCheckingDataset] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const catalog = catalogQuery.data;
  const validation = useMemo(() => validateSpec(specText, catalog), [specText, catalog]);
  const datesValid =
    /^\d{4}-\d{2}-\d{2}$/.test(startDate) &&
    /^\d{4}-\d{2}-\d{2}$/.test(endDate) &&
    Date.parse(isoDay(endDate, true)) > Date.parse(isoDay(startDate));
  const numbersValid =
    [capital, quantity, commission, slippageBps].every((value) => Number.isFinite(Number(value))) &&
    Number(capital) > 0 &&
    Number(quantity) > 0 &&
    Number(commission) >= 0 &&
    Number(slippageBps) >= 0 &&
    instrument.trim().length > 0;
  const canRun =
    isConfigured(cfg) &&
    validation.spec !== null &&
    datesValid &&
    numbersValid &&
    !runMutation.isPending;
  const definition = catalog?.strategies.find(
    (item) => item.kind === (validation.spec?.kind ?? ""),
  );

  const runs = useMemo(() => runsQuery.data?.runs ?? [], [runsQuery.data]);
  const filteredRuns = useMemo(() => filterRuns(runs, historyQuery), [runs, historyQuery]);
  const selected = useMemo(() => {
    if (selectedRunId) {
      const found = runs.find((run) => run.runId === selectedRunId);
      if (found) return found;
      if (result && result.runId === selectedRunId) return result;
    }
    return result ?? runs[0] ?? null;
  }, [selectedRunId, runs, result]);

  const state: RunState = runMutation.isPending
    ? "running"
    : runError
      ? "failed"
      : result
        ? "complete"
        : "idle";

  const checkDataset = async (): Promise<void> => {
    setCheckingDataset(true);
    setDatasetError(null);
    try {
      const history = await api.marketDataHistory(
        cfg.accountId,
        instrument.trim().toUpperCase(),
        interval,
        isoDay(startDate),
        isoDay(endDate, true),
      );
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
    runMutation.mutate(
      { body, signal: controller.signal },
      {
        onSuccess: (run) => {
          setResult(run);
          setSelectedRunId(run.runId);
          setRunError(null);
          toast.success(
            `Backtest finished: ${run.report.performance.tradeCount} trades, ${pct(run.report.performance.returnPct * 100)}`,
          );
        },
        onError: (error) => {
          const message = error instanceof Error ? error.message : "backtest failed";
          if (message !== "cancelled") {
            setRunError(message);
            toast.error(message);
          }
        },
        onSettled: () => {
          controllerRef.current = null;
        },
      },
    );
  };

  const pickKind = (kind: string): void => {
    const next = catalog?.strategies.find((item) => item.kind === kind);
    if (next) setSpecText(specJsonFor(next));
  };

  return (
    <div>
      <PageHeader
        title="Backtesting"
        subtitle="Deterministic runs over verified provider history. Signals computed on bar N fill at bar N+1 open, with the fee and slippage shown below; identical inputs reproduce identical results."
      />

      <Panel
        title="Configuration"
        action={
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "rounded-sm border px-2 py-0.5 text-[10px] font-semibold tracking-wider",
                STATE_STYLE[state],
              )}
            >
              {state.toUpperCase()}
            </span>
            {runMutation.isPending ? (
              <button
                type="button"
                onClick={() => controllerRef.current?.abort()}
                className="h-7 rounded-sm border border-negative/50 px-3 text-[11px] text-negative"
              >
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
        <div className="flex flex-col gap-2.5 p-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <label className="text-[11px] text-muted-foreground">
              Strategy
              <select
                value={validation.spec?.kind ?? ""}
                onChange={(e) => pickKind(e.target.value)}
                className="field-control num mt-1 h-8 w-full"
                aria-label="Strategy"
              >
                <option value="" disabled>
                  {catalog ? "Select…" : "Catalog unavailable"}
                </option>
                {catalog?.strategies.map((item) => (
                  <option key={item.kind} value={item.kind}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-muted-foreground">
              Instrument
              <input
                value={instrument}
                onChange={(e) => setInstrument(e.target.value.toUpperCase())}
                className="field-control num mt-1 h-8 w-full"
                placeholder="EURUSD"
              />
            </label>
            <label className="text-[11px] text-muted-foreground">
              Timeframe
              <select
                value={interval}
                onChange={(e) => setIntervalId(e.target.value)}
                className="field-control num mt-1 h-8 w-full"
              >
                {TIMEFRAMES.map((tf) => (
                  <option key={tf.id} value={tf.interval}>
                    {tf.label}
                    {tf.aggregated ? " (agg)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-muted-foreground">
              Start date
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="field-control num mt-1 h-8 w-full"
              />
            </label>
            <label className="text-[11px] text-muted-foreground">
              End date
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="field-control num mt-1 h-8 w-full"
              />
            </label>
            <div className="text-[11px] text-muted-foreground">
              Data coverage
              <button
                type="button"
                onClick={() => void checkDataset()}
                disabled={checkingDataset || !datesValid || !isConfigured(cfg)}
                className="mt-1 h-8 w-full rounded-sm border px-2 text-[11px] disabled:opacity-40"
              >
                {checkingDataset ? "Checking…" : "Check range"}
              </button>
            </div>
          </div>

          {!datesValid ? (
            <p role="alert" className="text-[10px] text-negative">
              End date must be after the start date.
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-2 border-t pt-2 sm:grid-cols-4 lg:grid-cols-6">
            {(
              [
                ["Capital", capital, setCapital],
                ["Qty", quantity, setQuantity],
                ["Fee/trade", commission, setCommission],
                ["Slip bps", slippageBps, setSlippageBps],
              ] as const
            ).map(([label, value, setter]) => (
              <label key={label} className="text-[10px] text-muted-foreground">
                {label}
                <input
                  inputMode="decimal"
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  className="field-control num mt-1 h-7 w-full"
                />
              </label>
            ))}
            <label className="flex items-end gap-2 pb-1 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={saveRun}
                onChange={(e) => setSaveRun(e.target.checked)}
              />
              Save run
            </label>
            <div className="flex items-end pb-1 text-[10px] text-muted-foreground">
              <Link
                to="/research"
                search={{ tab: "builder", spec: specText }}
                className="text-primary underline-offset-2 underline"
              >
                Edit spec in Builder
              </Link>
            </div>
          </div>

          {!numbersValid ? (
            <p role="alert" className="text-[10px] text-negative">
              Capital and quantity must be positive; fees and slippage must not be negative; an
              instrument is required.
            </p>
          ) : null}

          <div className="border-t pt-2 text-[11px]">
            {validation.error ? (
              <p
                role="alert"
                className="border border-negative/35 bg-negative/8 px-2 py-1.5 text-[10px] leading-snug text-negative"
              >
                {validation.error}
              </p>
            ) : (
              <p className="text-positive">
                Valid specification{definition ? ` — ${definition.name}` : ""}. The backend
                re-validates before running.
              </p>
            )}
            {dataset ? (
              <p className="num mt-1 text-muted-foreground">
                {dataset.count === 0
                  ? "No candles in this window from this provider."
                  : `${dataset.count} candles · ${dataset.returnedFrom ?? "—"} → ${dataset.returnedTo ?? "—"}`}
              </p>
            ) : null}
            {datasetError ? <p className="mt-1 text-negative">{datasetError}</p> : null}
            {runError ? (
              <p
                role="alert"
                className="mt-1 border border-negative/35 bg-negative/8 px-2 py-1.5 text-negative"
              >
                {runError}
              </p>
            ) : null}
            {!runError && runMutation.isPending ? (
              <p className="mt-1 text-muted-foreground">
                Running {instrument} {interval}… signals execute at the next bar open.
              </p>
            ) : null}
          </div>
        </div>
      </Panel>

      <div className="mt-3 grid gap-3 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Panel
          title="Run history"
          className="self-start lg:max-h-[calc(100vh-20rem)]"
          action={<span className="text-[10px] text-muted-foreground">{runs.length} saved</span>}
          bodyClassName="flex flex-col"
        >
          <div className="shrink-0 border-b p-2">
            <input
              value={historyQuery}
              onChange={(e) => setHistoryQuery(e.target.value)}
              placeholder="Filter by symbol, strategy, timeframe…"
              aria-label="Filter runs"
              className="field-control h-7 w-full text-[11px]"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {runsQuery.isPending && runsQuery.fetchStatus === "idle" ? (
              <NotConnected />
            ) : runsQuery.isLoading ? (
              <LoadingState label="Loading runs" />
            ) : runsQuery.error ? (
              <ErrorState error={runsQuery.error} />
            ) : runs.length === 0 ? (
              <EmptyState
                title="No saved runs"
                detail="Run a backtest with “Save run” enabled and it will appear here with its exact parameters and coverage."
              />
            ) : filteredRuns.length === 0 ? (
              <EmptyState title="No matching runs" detail={`Nothing matches “${historyQuery}”.`} />
            ) : (
              <ul className="divide-y divide-border/50">
                {filteredRuns.map((run) => (
                  <li key={run.runId}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRunId(run.runId);
                        setResult(null);
                        setRunError(null);
                      }}
                      aria-pressed={selected?.runId === run.runId}
                      className={cn(
                        "w-full px-3 py-2 text-left transition-colors hover:bg-accent/60",
                        selected?.runId === run.runId &&
                          "bg-accent shadow-[inset_2px_0_0_var(--primary)]",
                      )}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="num text-[12px] font-semibold">{run.instrumentId}</span>
                        <span className="num text-[10px] text-muted-foreground">
                          {time(run.createdAt)}
                        </span>
                      </div>
                      <div className="num mt-0.5 flex flex-wrap gap-x-2 text-[10px] text-muted-foreground">
                        <span>{run.interval}</span>
                        <span>
                          {run.strategy.kind} v{run.strategy.version}
                        </span>
                        <span>{run.report.performance.tradeCount} trades</span>
                      </div>
                      <div className="num mt-0.5 flex gap-3 text-[11px]">
                        <span className={tone(run.report.performance.returnPct)}>
                          {pct(run.report.performance.returnPct * 100)}
                        </span>
                        <span className="text-muted-foreground">
                          dd {pct(-run.report.performance.maxDrawdownPct * 100)}
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>

        <div className="flex min-w-0 flex-col gap-3">
          {selected ? (
            <Analysis run={selected} />
          ) : runsQuery.isPending && runsQuery.fetchStatus === "idle" ? (
            <NotConnected />
          ) : runsQuery.isLoading ? (
            <LoadingState label="Loading run" />
          ) : runsQuery.error ? (
            <ErrorState error={runsQuery.error} />
          ) : (
            <Panel title="Analysis">
              <EmptyState
                title="No run selected"
                detail="Run a backtest above, or pick one from the run history to inspect its equity curve, trades and assumptions."
              />
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function NotConnected() {
  return (
    <EmptyState
      title="Not connected to TradeLedger API"
      detail="Set the API base URL, account and token in Settings to load persisted runs."
    />
  );
}

function Analysis({ run }: { run: ResearchRun }) {
  const metrics = run.report.performance;
  const finite = (value: number | null | undefined): value is number =>
    typeof value === "number" && Number.isFinite(value);

  const cells: Array<{ label: string; value: string; cls?: string }> = [
    { label: "Total return", value: pct(metrics.returnPct * 100), cls: tone(metrics.returnPct) },
    { label: "Net P&L", value: money(metrics.netPnl, true), cls: tone(metrics.netPnl) },
    { label: "Max drawdown", value: pct(-metrics.maxDrawdownPct * 100), cls: "text-negative" },
    { label: "Win rate", value: pct(metrics.winRatePct * 100) },
    { label: "Trades", value: String(metrics.tradeCount) },
    {
      label: "Profit factor",
      value: finite(metrics.profitFactor) ? metrics.profitFactor.toFixed(2) : UNAVAILABLE,
    },
    {
      label: "Risk-adj. (sharpe-like)",
      value: finite(metrics.sharpeLike) ? metrics.sharpeLike.toFixed(2) : UNAVAILABLE,
    },
    {
      label: "Best / worst trade",
      value: `${money(run.report.robustness.bestTrade, true)} / ${money(run.report.robustness.worstTrade, true)}`,
    },
  ];

  const tradeColumns: Column<ResearchRun["trades"][number]>[] = [
    {
      key: "entryAt",
      header: "Entry",
      cell: (t) => <span className="num">{time(t.entryAt)}</span>,
    },
    { key: "exitAt", header: "Exit", cell: (t) => <span className="num">{time(t.exitAt)}</span> },
    {
      key: "side",
      header: "Side",
      cell: (t) => (
        <span
          className={cn("num font-semibold", t.side === "long" ? "text-positive" : "text-negative")}
        >
          {t.side.toUpperCase()}
        </span>
      ),
    },
    {
      key: "entryPrice",
      header: "Entry px",
      align: "right",
      cell: (t) => <span className="num">{t.entryPrice}</span>,
    },
    {
      key: "exitPrice",
      header: "Exit px",
      align: "right",
      cell: (t) => <span className="num">{t.exitPrice}</span>,
    },
    {
      key: "quantity",
      header: "Qty",
      align: "right",
      cell: (t) => <span className="num">{t.quantity}</span>,
    },
    {
      key: "pnl",
      header: "P&L",
      align: "right",
      cell: (t) => <span className={cn("num", tone(t.pnl))}>{money(t.pnl, true)}</span>,
    },
  ];

  return (
    <>
      <Panel
        title={`${run.instrumentId} · ${run.interval} · ${run.strategy.name} v${run.strategy.version}`}
        action={
          <div className="flex items-center gap-3">
            <span className="num text-[10px] text-muted-foreground">
              run {run.runId.slice(0, 8)} · {time(run.createdAt)}
            </span>
            <Link
              to="/research"
              search={{ tab: "experiments" }}
              className="text-[10px] text-primary underline-offset-2 underline"
            >
              Compare runs
            </Link>
          </div>
        }
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

          <div className="num mt-2 grid gap-1 text-[10px] text-muted-foreground sm:grid-cols-2">
            <span>
              Data: {run.dataRange.count} bars · {run.dataRange.from} → {run.dataRange.to}
              {run.dataRange.source ? ` · ${run.dataRange.source}` : ""}
            </span>
            <span>
              Requested {run.requested.from} → {run.requested.to} · parameters{" "}
              {JSON.stringify(run.strategy.parameters)}
            </span>
            <span>
              Capital {money(run.assumptions.initialCapital)} · qty {run.assumptions.quantity} · fee{" "}
              {money(run.assumptions.commissionPerTrade)}/trade · slip {run.assumptions.slippageBps}{" "}
              bps · fill {run.assumptions.execution}
            </span>
            <span>
              Validation {run.report.validation.passed ? "passed" : "failed"}
              {run.report.validation.failures.length > 0
                ? ` — ${run.report.validation.failures.join("; ")}`
                : ""}
            </span>
          </div>

          {run.warnings.length > 0 ? (
            <ul className="mt-2 border border-warning/35 bg-warning/8 px-2 py-1.5 text-[10px] leading-snug text-warning">
              {run.warnings.map((warning) => (
                <li key={warning}>• {warning}</li>
              ))}
            </ul>
          ) : null}

          <div className="mt-3 h-56">
            {run.equityCurve.length < 2 ? (
              <p className="text-[11px] text-muted-foreground">
                No equity curve recorded — the run produced too few equity points to plot.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={run.equityCurve} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
                  <XAxis
                    dataKey="at"
                    minTickGap={60}
                    tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    tickFormatter={(value: string) => String(value).slice(0, 10)}
                  />
                  <YAxis
                    orientation="right"
                    width={80}
                    tickFormatter={(value: number) => money(Number(value))}
                    tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    domain={["auto", "auto"]}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--panel)",
                      border: "1px solid var(--border)",
                      fontSize: 11,
                    }}
                    labelStyle={{ color: "var(--muted-foreground)" }}
                    formatter={(value: number | string) => [money(Number(value)), "Equity"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="equity"
                    stroke="var(--primary)"
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </Panel>

      <Panel
        title={`Trades (${run.trades.length})`}
        action={
          <span className="text-[10px] text-muted-foreground">
            next-bar-open fills · fee and slippage applied
          </span>
        }
      >
        <div className="max-h-72 overflow-auto">
          {run.trades.length === 0 ? (
            <EmptyState
              title="No trades in this range"
              detail="The strategy produced no entries for the executed bars. This is a real result, not a missing dataset."
            />
          ) : (
            <DataTable
              rows={[...run.trades]}
              columns={tradeColumns}
              rowKey={(t) => `${t.entryAt}-${t.exitAt}`}
            />
          )}
        </div>
      </Panel>
    </>
  );
}
