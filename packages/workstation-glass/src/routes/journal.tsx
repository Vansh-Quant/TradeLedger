import { createFileRoute } from "@tanstack/react-router";
import { useWorkstationDemo } from "@/hooks/use-tradeledger";
import { money } from "@/lib/format";
import { PageHeader, Panel, QueryView, DataTable } from "@/components/terminal/primitives";

export const Route = createFileRoute("/journal")({ component: JournalPage });

function JournalPage() {
  const q = useWorkstationDemo();
  return <div><PageHeader title="Journal" subtitle="Structured trade reviews and decision records." /><Panel title="Trade Journal" className="h-[calc(100vh-9rem)]"><QueryView q={q} empty={d=>d.journal.length===0}>{d=><DataTable rows={d.journal} columns={[
    {key:"date",header:"Date",cell:r=>r.date},
    {key:"symbol",header:"Symbol",cell:r=><span className="font-semibold">{r.symbol}</span>},
    {key:"setup",header:"Setup",cell:r=>r.setup},
    {key:"bias",header:"Bias",cell:r=>r.bias},
    {key:"rating",header:"Rating",align:"right",cell:r=>"★".repeat(r.rating)},
    {key:"pnl",header:"P&L",align:"right",cell:r=><span className={r.pnl>=0?"text-positive":"text-negative"}>{money(r.pnl,true)}</span>},
    {key:"note",header:"Review",cell:r=><span className="text-muted-foreground">{r.note}</span>},
  ]} rowKey={r=>r.id}/>}</QueryView></Panel></div>;
}
