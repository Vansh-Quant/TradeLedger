import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Panel } from "@/components/terminal/primitives";

export const Route = createFileRoute("/research")({
  head: () => ({
    meta: [
      { title: "Research — TradeLedger" },
      { name: "description", content: "Research runs and experiments." },
    ],
  }),
  component: ResearchPage,
});

function ResearchPage() {
  return (
    <div>
      <PageHeader
        title="Research"
        subtitle="Research execution and persisted experiments are not yet exposed by the backend."
      />
      <Panel title="Research engine unavailable">
        <div className="flex min-h-40 flex-col items-start justify-center gap-2 p-4">
          <p className="text-[13px] font-medium">No persisted research runs are connected.</p>
          <p className="type-meta max-w-xl">
            Sample studies, scores, sample counts, and timestamps have been removed.
            This screen will show results only after a real research execution and persistence API is implemented.
          </p>
        </div>
      </Panel>
    </div>
  );
}
