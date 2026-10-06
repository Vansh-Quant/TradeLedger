import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Panel } from "@/components/terminal/primitives";
import { OrderTicket, TradingChart, Watchlist } from "@/components/terminal/widgets";
import { ExecutionTable, OrderTable, PositionTable } from "@/components/terminal/tables";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/trading")({
  validateSearch: z.object({ symbol: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Trading — TradeLedger" },
      { name: "description", content: "Trading terminal: watchlist, chart, order ticket and blotter." },
      { property: "og:title", content: "Trading — TradeLedger" },
      { property: "og:description", content: "Trading terminal: watchlist, chart, order ticket and blotter." },
    ],
  }),
  component: Trading,
});

function Trading() {
  const { symbol = "" } = Route.useSearch();
  const navigate = useNavigate({ from: "/trading" });
  const setSymbol = (s: string) => navigate({ search: { symbol: s || undefined }, replace: true });
  const [tab, setTab] = useState<"positions" | "orders" | "executions">("positions");
  return (
    <div className="grid gap-3 lg:h-[calc(100vh-5rem)] lg:grid-rows-[1fr_260px]">
      <div className="grid min-h-0 gap-3 lg:grid-cols-[230px_1fr_290px]">
        <Panel title="Watchlist" className="h-80 lg:h-auto"><Watchlist selected={symbol} onSelect={setSymbol} /></Panel>
        <Panel className="h-96 lg:h-auto"><TradingChart symbol={symbol} /></Panel>
        <Panel title="Order Ticket" bodyClassName="overflow-auto"><OrderTicket symbol={symbol} onSymbol={setSymbol} /></Panel>
      </div>
      <Panel
        className="h-72 lg:h-auto"
        title={
          <div className="flex gap-1">
            {(["positions", "orders", "executions"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={cn("rounded-sm px-2 py-0.5 capitalize", tab === t ? "bg-primary/25 text-foreground" : "text-muted-foreground")}>{t}</button>
            ))}
          </div>
        }
      >
        {tab === "positions" ? <PositionTable /> : tab === "orders" ? <OrderTable /> : <ExecutionTable />}
      </Panel>
    </div>
  );
}
