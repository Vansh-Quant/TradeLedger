import { createFileRoute, Link } from "@tanstack/react-router";
import { Briefcase, Gauge, Scale, Sigma, TrendingUp, Wallet } from "lucide-react";
import { useAccountContext, useOrders } from "@/hooks/use-tradeledger";
import { money, tone, UNAVAILABLE } from "@/lib/format";
import { Panel } from "@/components/terminal/primitives";
import { AccountSummary, MetricCard, RiskGauge } from "@/components/terminal/widgets";
import { ExecutionTable, OrderTable, PositionTable } from "@/components/terminal/tables";
import { JarvisPanel } from "@/components/terminal/JarvisPanel";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — TradeLedger" },
      { name: "description", content: "Account equity, exposure, positions, orders and risk at a glance." },
      { property: "og:title", content: "Dashboard — TradeLedger" },
      { property: "og:description", content: "Account equity, exposure, positions, orders and risk at a glance." },
    ],
  }),
  component: Dashboard,
});

const ViewAll = ({ to }: { to: "/positions" | "/orders" | "/executions" | "/risk" }) => (
  <Link to={to} className="text-[11px] text-primary hover:underline">View all</Link>
);

function Dashboard() {
  const { data: c } = useAccountContext();
  const orders = useOrders();
  const active = orders.data?.filter((o) => ["CREATED", "SUBMITTED", "ACKNOWLEDGED", "PARTIALLY_FILLED"].includes(String(o.status))).length;
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6 [&>*]:min-w-0">
        <MetricCard label="Total Equity" value={money(c?.totalEquity)} icon={<Wallet className="size-4" />} />
        <MetricCard label="Buying Power" value={money(c?.buyingPower)} icon={<Briefcase className="size-4" />} sub={c?.buyingPower != null && "Available for new positions"} />
        <MetricCard label="Daily P&L" value={money(c?.dailyPnl, true)} valueTone={tone(c?.dailyPnl)} icon={<TrendingUp className="size-4" />} />
        <MetricCard label="Unrealized P&L" value={money(c?.unrealizedPnl, true)} valueTone={tone(c?.unrealizedPnl)} icon={<Sigma className="size-4" />} />
        <MetricCard label="Gross Exposure" value={money(c?.grossExposure)} icon={<Gauge className="size-4" />} />
        <MetricCard label="Net Exposure" value={money(c?.netExposure, true)} icon={<Scale className="size-4" />} />
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_240px]">
        <Panel title={`Open Positions${c ? ` (${c.positions.length})` : ""}`} action={<ViewAll to="/positions" />} className="min-w-0 lg:h-72"><PositionTable compact /></Panel>
        <Panel title={`Active Orders${active != null ? ` (${active})` : ""}`} action={<ViewAll to="/orders" />} className="min-w-0 lg:h-72"><OrderTable compact activeOnly /></Panel>
        <Panel title="Recent Executions" action={<ViewAll to="/executions" />} className="min-w-0 lg:h-72"><ExecutionTable compact /></Panel>
        <Panel title="JARVIS" className="min-w-0 lg:h-72 xl:row-span-2 xl:h-auto"><JarvisPanel compact /></Panel>
        <Panel title="Risk Metrics" action={<ViewAll to="/risk" />} className="min-w-0 xl:col-span-2">
          <div className="grid h-full grid-cols-1 items-center gap-2 sm:grid-cols-3">
            <RiskGauge label="Gross Exposure" value={c?.grossExposure} limit={c?.limits.maxGrossExposure} />
            <RiskGauge label="Net Exposure" value={c?.netExposure} limit={c?.limits.maxNetExposure} />
            <RiskGauge label="Daily Loss" value={c?.dailyLoss} limit={c?.limits.maxDailyLoss} />
          </div>
        </Panel>
        <Panel title="Account Summary" className="min-w-0"><AccountSummary /></Panel>
      </div>
      {!c && <p className="text-center text-[11px] text-muted-foreground">Values show "{UNAVAILABLE}" until the backend provides them.</p>}
    </div>
  );
}
