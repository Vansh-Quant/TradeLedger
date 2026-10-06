import { createFileRoute } from "@tanstack/react-router";
import { EmptyState, PageHeader, Panel } from "@/components/terminal/primitives";

export const Route = createFileRoute("/research")({
  head: () => ({ meta: [
    { title: "Research — TradeLedger" },
    { name: "description", content: "Research notebooks and studies." },
    { property: "og:title", content: "Research — TradeLedger" },
    { property: "og:description", content: "Research notebooks and studies." },
  ] }),
  component: ResearchPage,
});

function ResearchPage() {
  return (
    <div>
      <PageHeader title="Research" subtitle="Research notebooks and studies." />
      <Panel className="h-72"><EmptyState title="No API endpoint yet" detail="The TradeLedger API does not expose research data yet. This workspace activates once the endpoint is available." /></Panel>
    </div>
  );
}
