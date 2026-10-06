import { createFileRoute } from "@tanstack/react-router";
import { EmptyState, PageHeader, Panel } from "@/components/terminal/primitives";

export const Route = createFileRoute("/analytics")({
  head: () => ({ meta: [
    { title: "Analytics — TradeLedger" },
    { name: "description", content: "Performance and attribution analytics." },
    { property: "og:title", content: "Analytics — TradeLedger" },
    { property: "og:description", content: "Performance and attribution analytics." },
  ] }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  return (
    <div>
      <PageHeader title="Analytics" subtitle="Performance and attribution analytics." />
      <Panel className="h-72"><EmptyState title="No API endpoint yet" detail="The TradeLedger API does not expose analytics data yet. This workspace activates once the endpoint is available." /></Panel>
    </div>
  );
}
