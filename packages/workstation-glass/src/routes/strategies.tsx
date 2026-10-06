import { createFileRoute } from "@tanstack/react-router";
import { useWorkstationDemo } from "@/hooks/use-tradeledger";
import { pct } from "@/lib/format";
import { PageHeader, Panel, QueryView, DataTable } from "@/components/terminal/primitives";

export const Route = createFileRoute("/strategies")({ component: StrategiesPage });

function StrategiesPage() {
  const q = useWorkstationDemo();
  return <div><PageHeader title="Strategies" subtitle="Deterministic strategy registry and allocation state." /><Panel title="Strategy Registry" className="h-[calc(100vh-9rem)]"><QueryView q={q} empty={d=>d.strategies.length===0}>{d=><DataTable rows={d.strategies} columns={[
    {key:"id",header:"ID",cell:r=><span className="text-muted-foreground">{r.id}</span>},
    {key:"name",header:"Strategy",cell:r=><span className="font-semibold">{r.name}</span>},
    {key:"state",header:"State",cell:r=><span className="text-primary">{r.state}</span>},
    {key:"version",header:"Version",cell:r=>r.version},
    {key:"return",header:"Return",align:"right",cell:r=><span className={r.returnPct>=0?"text-positive":"text-negative"}>{pct(r.returnPct)}</span>},
    {key:"sharpe",header:"Sharpe",align:"right",cell:r=>r.sharpe.toFixed(2)},
    {key:"alloc",header:"Allocation",align:"right",cell:r=>pct(r.allocationPct)},
  ]} rowKey={r=>r.id}/>}</QueryView></Panel></div>;
}
