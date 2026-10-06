import { createFileRoute } from "@tanstack/react-router";
import { useWorkstationDemo } from "@/hooks/use-tradeledger";
import { money, pct } from "@/lib/format";
import { MetricCard, Sparkline } from "@/components/terminal/widgets";
import { PageHeader, Panel, QueryView, DataTable } from "@/components/terminal/primitives";

export const Route = createFileRoute("/analytics")({ component: AnalyticsPage });

function AnalyticsPage() {
  const q = useWorkstationDemo();
  return <div><PageHeader title="Analytics" subtitle="Performance, risk-adjusted returns and strategy attribution." /><QueryView q={q}>{(d) => <div className="grid gap-3">
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <MetricCard label="Total Return" value={pct(d.analytics.metrics.totalReturnPct)} />
      <MetricCard label="Sharpe" value={d.analytics.metrics.sharpe.toFixed(2)} />
      <MetricCard label="Max Drawdown" value={pct(d.analytics.metrics.maxDrawdownPct)} />
      <MetricCard label="Win Rate" value={pct(d.analytics.metrics.winRatePct)} />
    </div>
    <Panel title="Equity Curve"><div className="p-4"><Sparkline data={d.analytics.equityCurve} className="h-40 w-full" /></div></Panel>
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel title="Performance Metrics"><div className="grid grid-cols-2 gap-3 p-4 text-xs">{Object.entries(d.analytics.metrics).map(([k,v]) => <div key={k} className="rounded border p-3"><div className="text-muted-foreground">{k}</div><div className="num mt-1 text-lg">{typeof v === "number" ? v.toFixed(2) : v}</div></div>)}</div></Panel>
      <Panel title="Strategy Attribution"><DataTable rows={d.analytics.attribution} columns={[
        {key:"s",header:"Strategy",cell:r=><span>{r.strategy}</span>},
        {key:"p",header:"P&L",align:"right",cell:r=><span className="text-positive">{money(r.pnl,true)}</span>}
      ]} rowKey={r=>r.strategy}/></Panel>
    </div>
  </div>}</QueryView></div>;
}
