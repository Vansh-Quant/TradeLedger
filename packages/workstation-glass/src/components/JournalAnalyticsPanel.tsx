import { useMemo } from "react";
import type { JournalEntry } from "@/lib/journal-store";
import { analyzeJournal, type JournalBreakdownRow } from "@/lib/journal-analytics";

function money(value: number | null): string {
  if (value === null) return "—";
  return (
    (value < 0 ? "−" : value > 0 ? "+" : "") +
    "$" +
    Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}
function number(value: number | null, suffix = ""): string {
  return value === null || !Number.isFinite(value) ? "—" : value.toFixed(2) + suffix;
}
function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="min-w-0 rounded-sm border border-border/70 bg-background/40 p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold tabular-nums">{value}</p>
      {detail && <p className="mt-1 text-[10px] text-muted-foreground">{detail}</p>}
    </div>
  );
}
function Breakdown({ title, rows }: { title: string; rows: JournalBreakdownRow[] }) {
  const visible = rows.slice(0, 5);
  return (
    <section className="min-w-0 rounded-sm border border-border/70">
      <div className="border-b border-border/70 px-3 py-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide">{title}</h3>
      </div>
      {visible.length === 0 ? (
        <p className="p-3 text-xs text-muted-foreground">Closed trades will appear here.</p>
      ) : (
        <div className="divide-y divide-border/50">
          {visible.map((row) => (
            <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium" title={row.key}>
                  {row.key}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {row.trades} trades · {row.winRate.toFixed(0)}% wins · avg{" "}
                  {number(row.averageR, "R")}
                </p>
              </div>
              <p
                className={
                  "self-center whitespace-nowrap text-xs font-semibold tabular-nums " +
                  (row.netPnl < 0 ? "text-negative" : row.netPnl > 0 ? "text-positive" : "")
                }
              >
                {money(row.netPnl)}
              </p>
            </div>
          ))}
          {rows.length > visible.length && (
            <p className="px-3 py-2 text-[10px] text-muted-foreground">
              Showing 5 of {rows.length} groups, sorted by net P&amp;L.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export function JournalAnalyticsPanel({ entries }: { entries: readonly JournalEntry[] }) {
  const stats = useMemo(() => analyzeJournal(entries), [entries]);
  const streakLabel =
    stats.currentStreak.kind === "NONE"
      ? "No active streak"
      : stats.currentStreak.length +
        " " +
        stats.currentStreak.kind.toLowerCase() +
        (stats.currentStreak.length === 1 ? "" : "s");

  return (
    <section className="space-y-2" aria-label="Journal performance analytics">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Performance &amp; process analytics</h2>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Calculated from your journal only; open trades are excluded from closed-trade metrics.
          </p>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {stats.pnlTrades} closed trades with P&amp;L recorded
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        <Metric
          label="Expectancy / trade"
          value={money(stats.expectancy)}
          detail="Mean realized P&L per trade with P&L"
        />
        <Metric
          label="Profit factor"
          value={number(stats.profitFactor)}
          detail={
            stats.grossLoss === 0 && stats.grossProfit > 0
              ? "No recorded gross losses"
              : "Gross profit ÷ gross loss"
          }
        />
        <Metric
          label="Max P&L drawdown"
          value={money(stats.maxDrawdown === null ? null : -stats.maxDrawdown)}
          detail={
            stats.maxDrawdownPercent === null
              ? "Peak percentage unavailable"
              : number(stats.maxDrawdownPercent, "% of prior peak")
          }
        />
        <Metric
          label="Current outcome streak"
          value={streakLabel}
          detail={"Best win " + stats.bestWinStreak + " · longest loss " + stats.worstLossStreak}
        />
      </div>
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        <Metric label="Gross profit" value={money(stats.grossProfit)} />
        <Metric label="Gross loss" value={money(-stats.grossLoss)} />
        <Metric
          label="Average win / loss"
          value={
            stats.averageWin === null || stats.averageLoss === null
              ? "—"
              : money(stats.averageWin) + " / " + money(-stats.averageLoss)
          }
        />
        <Metric
          label="Payoff ratio"
          value={number(stats.payoffRatio)}
          detail="Average win ÷ average loss"
        />
      </div>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
        <Breakdown title="By setup" rows={stats.setups} />
        <Breakdown title="By session" rows={stats.sessions} />
        <Breakdown title="By emotion" rows={stats.emotions} />
      </div>
      <p className="text-[10px] text-muted-foreground">
        These are descriptive journal statistics, not a strategy-performance guarantee. Results
        depend on complete and consistently recorded trade data.
      </p>
    </section>
  );
}
