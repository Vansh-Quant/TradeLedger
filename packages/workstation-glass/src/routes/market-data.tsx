import { createFileRoute } from "@tanstack/react-router";
import { EmptyState, PageHeader, Panel } from "@/components/terminal/primitives";

export const Route = createFileRoute("/market-data")({
  head: () => ({ meta: [
    { title: "Market Data — TradeLedger" },
    { name: "description", content: "Market data feeds and instruments." },
    { property: "og:title", content: "Market Data — TradeLedger" },
    { property: "og:description", content: "Market data feeds and instruments." },
  ] }),
  component: MarketDataPage,
});

function MarketDataPage() {
  return (
    <div>
      <PageHeader title="Market Data" subtitle="Market data feeds and instruments." />
      <Panel className="h-72"><EmptyState title="No API endpoint yet" detail="The TradeLedger API does not expose market data data yet. This workspace activates once the endpoint is available." /></Panel>
    </div>
  );
}
