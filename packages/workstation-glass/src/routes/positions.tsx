import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Panel } from "@/components/terminal/primitives";
import { PositionTable } from "@/components/terminal/tables";

export const Route = createFileRoute("/positions")({
  head: () => ({ meta: [
    { title: "Positions — TradeLedger" },
    { name: "description", content: "Open positions as reported by the TradeLedger backend." },
    { property: "og:title", content: "Positions — TradeLedger" },
    { property: "og:description", content: "Open positions as reported by the TradeLedger backend." },
  ] }),
  component: PositionsPage,
});

function PositionsPage() {
  return (
    <div>
      <PageHeader title="Positions" subtitle="Open positions as reported by the TradeLedger backend." />
      <Panel title="Open Positions" className="h-[calc(100vh-9rem)]"><PositionTable /></Panel>
    </div>
  );
}
