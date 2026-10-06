import { createFileRoute } from "@tanstack/react-router";
import { useWorkstationDemo } from "@/hooks/use-tradeledger";
import type { WorkstationDemoData } from "@/api/types";
import { money, price, pct } from "@/lib/format";
import { PageHeader, Panel, QueryView, DataTable, type Column } from "@/components/terminal/primitives";

export const Route = createFileRoute("/market-data")({ component: MarketDataPage });

function MarketDataPage() {
  const q = useWorkstationDemo();
  const cols: Column<WorkstationDemoData["marketData"][number]>[] = [
    { key: "s", header: "Symbol", cell: (r) => <span className="font-semibold">{r.symbol}</span> },
    { key: "b", header: "Bid", align: "right", cell: (r) => price(r.bid) },
    { key: "a", header: "Ask", align: "right", cell: (r) => price(r.ask) },
    { key: "l", header: "Last", align: "right", cell: (r) => price(r.last) },
    { key: "c", header: "Change", align: "right", cell: (r) => <span className={r.change >= 0 ? "text-positive" : "text-negative"}>{money(r.change, true)}</span> },
    { key: "cp", header: "Change %", align: "right", cell: (r) => <span className={r.changePct >= 0 ? "text-positive" : "text-negative"}>{pct(r.changePct)}</span> },
    { key: "v", header: "Volume", align: "right", cell: (r) => r.volume.toLocaleString() },
    { key: "st", header: "Status", cell: (r) => <span className="text-positive">{r.status}</span> },
  ];
  return <div><PageHeader title="Market Data" subtitle="Development feed with deterministic quote snapshots for UI validation." /><Panel title="Live Instruments" className="h-[calc(100vh-9rem)]"><QueryView q={q} empty={(d) => d.marketData.length === 0}>{(d) => <DataTable rows={d.marketData} columns={cols} rowKey={(r) => r.symbol} />}</QueryView></Panel></div>;
}
