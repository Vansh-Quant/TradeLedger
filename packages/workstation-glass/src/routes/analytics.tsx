import { createFileRoute } from "@tanstack/react-router";
import { useAccountContext } from "@/hooks/use-tradeledger";
import { money, tone } from "@/lib/format";
import { MetricCard } from "@/components/terminal/widgets";
import { PageHeader, Panel, QueryView } from "@/components/terminal/primitives";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — TradeLedger" },
      { name: "description", content: "Portfolio values reported by the backend. Return-ratio analytics are not yet exposed." },
    ],
  }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const q = useAccountContext();

  return (
    <div>
      <PageHeader
        title="Analytics"
        subtitle="Portfolio values reported by the backend. Return-ratio analytics require an equity series that no endpoint exposes yet."
      />
      <QueryView q={q}>
        {(c) => {
          const positionCount = c.positions.length;
          return (
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <MetricCard label="Market Value" value={money(c.marketValue)} sub="reported by the portfolio" />
                <MetricCard label="Realized P&L" value={money(c.realizedPnl, true)} valueTone={tone(c.realizedPnl)} sub="reported by the portfolio" />
                <MetricCard label="Unrealized P&L" value={money(c.unrealizedPnl, true)} valueTone={tone(c.unrealizedPnl)} sub="reported by the portfolio" />
                <MetricCard label="Gross Exposure" value={money(c.grossExposure)} sub="reported by the portfolio" />
                <MetricCard label="Net Exposure" value={money(c.netExposure, true)} valueTone={tone(c.netExposure)} sub="reported by the portfolio" />
                <MetricCard label="Buying Power" value={money(c.buyingPower)} sub="total capacity" />
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <Panel title="Portfolio Composition">
                  <dl className="divide-y divide-border/50 px-3 py-1 text-xs">
                    {([
                      ["Open positions", String(positionCount)],
                      ["Market value", money(c.marketValue)],
                      ["Gross exposure", money(c.grossExposure)],
                      ["Net exposure", money(c.netExposure, true)],
                      ["Realized P&L", money(c.realizedPnl, true)],
                      ["Unrealized P&L", money(c.unrealizedPnl, true)],
                    ] as const).map(([label, value]) => (
                      <div key={label} className="flex justify-between py-2">
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className={cn("num", value === "Unavailable" && "text-muted-foreground")}>{value}</dd>
                      </div>
                    ))}
                  </dl>
                </Panel>

                <Panel title="Return Analytics">
                  <div className="flex h-full flex-col gap-2 p-4">
                    <p className="text-[13px] font-medium">Not computed by the current API</p>
                    <p className="type-meta">
                      Sharpe, Sortino, maximum drawdown, Calmar, win rate, profit factor and strategy attribution need a
                      time series of account returns. The backend exposes current portfolio state, not that series, so
                      these ratios are not shown.
                    </p>
                    <div className="mt-1 grid grid-cols-2 gap-2 text-[10px] text-muted-foreground sm:grid-cols-3">
                      {["Sharpe", "Sortino", "Max drawdown", "Calmar", "Win rate", "Attribution"].map((label) => (
                        <div key={label} className="flex items-center justify-between rounded-sm border border-dashed px-2 py-1.5">
                          <span>{label}</span>
                          <span className="num">—</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-auto text-[10px] text-muted-foreground">
                      Deterministic ratio functions exist in the domain layer; exposing them requires a verified
                      equity-return endpoint. Nothing on this page is estimated in the browser.
                    </p>
                  </div>
                </Panel>
              </div>

              <Panel title="Data Notes">
                <dl className="grid gap-2 p-3 text-[11px] sm:grid-cols-2">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Account</dt>
                    <dd className="num">{c.accountId}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Source</dt>
                    <dd className="num">GET /api/v1/accounts/{"{accountId}"}/context</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Total equity</dt>
                    <dd className="num">{money(c.totalEquity)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Cash</dt>
                    <dd className="num">{money(c.cash)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Day P&L</dt>
                    <dd className="num">{money(c.dailyPnl, true)}</dd>
                  </div>
                  <p className="text-[10px] leading-4 text-muted-foreground sm:col-span-2">
                    Equity, cash and day P&L are not part of the trading-context contract. They render as Unavailable
                    rather than being derived from other fields.
                  </p>
                </dl>
              </Panel>
            </div>
          );
        }}
      </QueryView>
    </div>
  );
}
