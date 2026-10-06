import { createFileRoute } from "@tanstack/react-router";
import { useWorkstationDemo } from "@/hooks/use-tradeledger";
import { PageHeader, Panel, QueryView, DataTable } from "@/components/terminal/primitives";

export const Route = createFileRoute("/research")({ component: ResearchPage });

function ResearchPage() {
  const q = useWorkstationDemo();
  return <div><PageHeader title="Research" subtitle="Studies, experiments and quantitative research runs." /><Panel title="Research Runs" className="h-[calc(100vh-9rem)]"><QueryView q={q} empty={d=>d.research.length===0}>{d=><DataTable rows={d.research} columns={[
    {key:"id",header:"ID",cell:r=><span className="text-muted-foreground">{r.id}</span>},
    {key:"title",header:"Study",cell:r=><span className="font-semibold">{r.title}</span>},
    {key:"status",header:"Status",cell:r=><span className="text-primary">{r.status}</span>},
    {key:"score",header:"Score",align:"right",cell:r=><span className="num">{r.score.toFixed(2)}</span>},
    {key:"samples",header:"Samples",align:"right",cell:r=>r.samples.toLocaleString()},
    {key:"updated",header:"Updated",cell:r=>new Date(r.updatedAt).toLocaleString()},
  ]} rowKey={r=>r.id}/>}</QueryView></Panel></div>;
}
