import { createFileRoute } from "@tanstack/react-router";
import { useWorkstationDemo } from "@/hooks/use-tradeledger";
import { PageHeader, Panel, QueryView, DataTable } from "@/components/terminal/primitives";
import { FixtureGate } from "@/components/terminal/FixtureGate";

export const Route = createFileRoute("/research")({
  head: () => ({
    meta: [
      { title: "Research — TradeLedger" },
      { name: "description", content: "Research runs and experiments. No research execution API is exposed yet." },
    ],
  }),
  component: ResearchPage,
});

function ResearchPage() {
  return (
    <div>
      <PageHeader
        title="Research"
        subtitle="No research-execution HTTP contract exists. Persisted studies are not available from this workstation yet."
      />
      <FixtureGate
        title="Research engine not exposed"
        reason="There is no research endpoint at the HTTP boundary."
        detail={
          <>
            The domain layer contains deterministic research primitives, but they are not exposed through the application
            or HTTP boundary, so no study, score or sample count can be loaded here. The sample rows are a development
            fixture used for layout validation only. They are not persisted runs and carry no account meaning.
          </>
        }
        fixture={<ResearchFixture />}
      />
    </div>
  );
}

function ResearchFixture() {
  const q = useWorkstationDemo();
  return (
    <Panel title="Fixture research rows" className="h-[calc(100vh-14rem)]">
      <QueryView
        q={q}
        empty={(d) => d.research.length === 0}
        emptyTitle="No fixture rows"
        emptyDetail="The development demo endpoint returned no research objects."
      >
        {(d) => (
          <DataTable
            rows={d.research}
            columns={[
              { key: "id", header: "ID", cell: (r) => <span className="text-muted-foreground">{r.id}</span> },
              { key: "title", header: "Study", cell: (r) => <span className="font-semibold">{r.title}</span> },
              { key: "status", header: "Status", cell: (r) => <span className="text-muted-foreground">{r.status}</span> },
              { key: "score", header: "Score", align: "right", cell: (r) => <span className="num">{r.score.toFixed(2)}</span> },
              { key: "samples", header: "Samples", align: "right", cell: (r) => <span className="num">{r.samples.toLocaleString()}</span> },
              { key: "updated", header: "Updated", cell: (r) => <span className="text-muted-foreground">{new Date(r.updatedAt).toLocaleString()}</span> },
            ]}
            rowKey={(r) => r.id}
          />
        )}
      </QueryView>
    </Panel>
  );
}
