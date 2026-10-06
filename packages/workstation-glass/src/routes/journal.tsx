import { createFileRoute } from "@tanstack/react-router";
import { EmptyState, PageHeader, Panel } from "@/components/terminal/primitives";

export const Route = createFileRoute("/journal")({
  head: () => ({ meta: [
    { title: "Journal — TradeLedger" },
    { name: "description", content: "Trade journal entries." },
    { property: "og:title", content: "Journal — TradeLedger" },
    { property: "og:description", content: "Trade journal entries." },
  ] }),
  component: JournalPage,
});

function JournalPage() {
  return (
    <div>
      <PageHeader title="Journal" subtitle="Trade journal entries." />
      <Panel className="h-72"><EmptyState title="No API endpoint yet" detail="The TradeLedger API does not expose journal data yet. This workspace activates once the endpoint is available." /></Panel>
    </div>
  );
}
