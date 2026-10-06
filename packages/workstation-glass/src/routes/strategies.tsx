import { createFileRoute } from "@tanstack/react-router";
import { EmptyState, PageHeader, Panel } from "@/components/terminal/primitives";

export const Route = createFileRoute("/strategies")({
  head: () => ({ meta: [
    { title: "Strategies — TradeLedger" },
    { name: "description", content: "Deterministic strategy registry." },
    { property: "og:title", content: "Strategies — TradeLedger" },
    { property: "og:description", content: "Deterministic strategy registry." },
  ] }),
  component: StrategiesPage,
});

function StrategiesPage() {
  return (
    <div>
      <PageHeader title="Strategies" subtitle="Deterministic strategy registry." />
      <Panel className="h-72"><EmptyState title="No API endpoint yet" detail="The TradeLedger API does not expose strategies data yet. This workspace activates once the endpoint is available." /></Panel>
    </div>
  );
}
