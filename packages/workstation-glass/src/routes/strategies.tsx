import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Panel } from "@/components/terminal/primitives";

export const Route = createFileRoute("/strategies")({
  head: () => ({
    meta: [
      { title: "Strategies — TradeLedger" },
      { name: "description", content: "Strategy registry status." },
    ],
  }),
  component: StrategiesPage,
});

function StrategiesPage() {
  return (
    <div>
      <PageHeader
        title="Strategies"
        subtitle="Strategy registry data is not yet available from the backend."
      />
      <Panel title="Strategy registry unavailable">
        <div className="flex min-h-40 flex-col items-start justify-center gap-2 p-4">
          <p className="text-[13px] font-medium">No persisted strategy registry is connected.</p>
          <p className="type-meta max-w-xl">
            Sample strategy names, returns, Sharpe ratios, and allocations have been removed.
            This screen will show strategies only after a real registry and API are implemented.
          </p>
        </div>
      </Panel>
    </div>
  );
}
