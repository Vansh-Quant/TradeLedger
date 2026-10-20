import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMarketData } from "@/hooks/use-tradeledger";
import { price, time } from "@/lib/format";
import { describeMarketData, formatAge } from "@/lib/market-data-view";
import { PageHeader, Panel, QueryView, DataTable, type Column } from "@/components/terminal/primitives";
import type { MarketDataRow } from "@/lib/market-data-view";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/market-data")({
  head: () => ({
    meta: [
      { title: "Market Data — TradeLedger" },
      { name: "description", content: "Authoritative ingested market-data state from the TradeLedger backend." },
    ],
  }),
  component: MarketDataPage,
});

const TONE: Record<string, string> = {
  LIVE: "border-positive/40 text-positive",
  STALE: "border-warning/40 text-warning",
  EMPTY: "border-border text-muted-foreground",
  CONNECTING: "border-border text-muted-foreground",
  UNAVAILABLE: "border-negative/40 text-negative",
};

const DOT: Record<string, string> = {
  LIVE: "bg-positive",
  STALE: "bg-warning",
  EMPTY: "bg-muted-foreground",
  CONNECTING: "bg-muted-foreground",
  UNAVAILABLE: "bg-negative",
};

function MarketDataPage() {
  const q = useMarketData();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const view = useMemo(
    () => describeMarketData({
      states: q.data,
      error: q.error ? (q.error instanceof Error ? q.error.message : "market data unavailable") : null,
      now,
    }),
    [q.data, q.error, now],
  );

  const columns: Column<MarketDataRow>[] = [
    { key: "s", header: "Instrument", cell: (r) => <span className="font-semibold">{r.instrumentId}</span> },
    { key: "b", header: "Bid", align: "right", cell: (r) => price(r.bid) },
    { key: "a", header: "Ask", align: "right", cell: (r) => price(r.ask) },
    { key: "l", header: "Last trade / close", align: "right", cell: (r) => price(r.last) },
    {
      key: "src",
      header: "Source",
      cell: (r) => <span className="text-muted-foreground">{r.source ?? "—"}</span>,
    },
    { key: "seq", header: "Sequence", align: "right", cell: (r) => <span className="num">{r.sequence}</span> },
    { key: "obs", header: "Observed", cell: (r) => <span className="text-muted-foreground">{r.observedAt ? time(r.observedAt) : "—"}</span> },
    {
      key: "age",
      header: "Age",
      align: "right",
      cell: (r) => <span className={cn("num", r.ageMs !== null && r.ageMs > 30_000 ? "text-warning" : "text-muted-foreground")}>{formatAge(r.ageMs)}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Market Data"
        subtitle="Read-only state ingested by the backend market-data pipeline. Values are never synthesised in the browser."
        action={
          <div className={cn("flex items-center gap-2 rounded-sm border px-2.5 py-1.5 text-[10px] font-semibold tracking-wider", TONE[view.status])}>
            <span className={cn("size-1.5 rounded-full", DOT[view.status])} />
            {view.status}
          </div>
        }
      />

      <div className="mb-3 grid gap-2 border border-border bg-panel px-3 py-2 text-[11px] sm:grid-cols-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Source</span>
          <span className="num">GET /api/v1/market-data</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Instruments</span>
          <span className="num">{view.rows.length}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Freshest observation</span>
          <span className={cn("num", view.status === "LIVE" ? "text-positive" : "text-warning")}>{formatAge(view.freshestAgeMs)}</span>
        </div>
      </div>

      <Panel title="Ingested State" className="h-[calc(100vh-11rem)]">
        <QueryView
          q={q}
          empty={() => view.rows.length === 0}
          emptyTitle="No market data ingested"
          emptyDetail="The backend market-data pipeline has no instrument state yet. This page does not fill the gap with demo quotes."
        >
          {() => <DataTable rows={view.rows} columns={columns} rowKey={(r) => r.instrumentId} />}
        </QueryView>
      </Panel>

      <p className="mt-2 text-[10px] text-muted-foreground">
        LIVE requires a successful read and an observation no older than 30 seconds. Older observations are labelled STALE.
        A vendor feed adapter must populate this state through the backend ingestion boundary; the workstation never writes prices.
      </p>
    </div>
  );
}
