import { createFileRoute } from "@tanstack/react-router";
import { useWorkstationDemo } from "@/hooks/use-tradeledger";
import { pct } from "@/lib/format";
import { PageHeader, Panel, QueryView, DataTable } from "@/components/terminal/primitives";
import { FixtureGate } from "@/components/terminal/FixtureGate";

export const Route = createFileRoute("/strategies")({
  head: () => ({
    meta: [
      { title: "Strategies — TradeLedger" },
      { name: "description", content: "Strategy registry and allocation state. No registry API is exposed yet." },
    ],
  }),
  component: StrategiesPage,
});

function StrategiesPage() {
  return (
    <div>
      <PageHeader
        title="Strategies"
        subtitle="No strategy-registry HTTP contract is wired. Live strategy state, returns and allocations cannot be loaded here."
      />
      <FixtureGate
        title="Strategy registry not exposed"
        reason="No strategy-registry endpoint exists at the HTTP boundary."
        detail={
          <>
            The domain has an in-memory strategy registry, but no application or HTTP read contract. A strategy cannot be
            allocated, promoted or scored from this screen, and the sample rows below are layout fixtures — their return,
            Sharpe and allocation values are illustrative only.
          </>
        }
        fixture={<StrategyFixture />}
      />
    </div>
  );
}

function StrategyFixture() {
  const q = useWorkstationDemo();
  return (
    <Panel title="Fixture strategy rows" className="h-[calc(100vh-14rem)]">
      <QueryView
        q={q}
        empty={(d) => d.strategies.length === 0}
        emptyTitle="No fixture rows"
        emptyDetail="The development demo endpoint returned no strategies."
      >
        {(d) => (
          <DataTable
            rows={d.strategies}
            columns={[
              { key: "id", header: "ID", cell: (r) => <span className="text-muted-foreground">{r.id}</span> },
              { key: "name", header: "Strategy", cell: (r) => <span className="font-semibold">{r.name}</span> },
              { key: "state", header: "State", cell: (r) => <span className="text-muted-foreground">{r.state}</span> },
              { key: "version", header: "Version", cell: (r) => r.version },
              { key: "return", header: "Return", align: "right", cell: (r) => <span className={r.returnPct >= 0 ? "text-positive" : "text-negative"}>{pct(r.returnPct)}</span> },
              { key: "sharpe", header: "Sharpe", align: "right", cell: (r) => <span className="num">{r.sharpe.toFixed(2)}</span> },
              { key: "alloc", header: "Allocation", align: "right", cell: (r) => <span className="num">{pct(r.allocationPct)}</span> },
            ]}
            rowKey={(r) => r.id}
          />
        )}
      </QueryView>
    </Panel>
  );
}
