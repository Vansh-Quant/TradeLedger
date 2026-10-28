import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Panel } from "@/components/terminal/primitives";
import { ExecutionTable } from "@/components/terminal/tables";

export const Route = createFileRoute("/executions")({
  head: () => ({
    meta: [
      { title: "Executions — TradeLedger" },
      { name: "description", content: "Execution history with venue and fees." },
      { property: "og:title", content: "Executions — TradeLedger" },
      { property: "og:description", content: "Execution history with venue and fees." },
    ],
  }),
  component: ExecutionsPage,
});

function ExecutionsPage() {
  return (
    <div>
      <PageHeader
        title="Executions"
        subtitle="Executions are recorded by POST /api/v1/executions, but the trading-context read does not include them and no executions list endpoint exists. This page shows only fills the account context actually returns."
      />
      <Panel title="Execution History" className="h-[calc(100vh-9rem)]">
        <ExecutionTable />
      </Panel>
    </div>
  );
}
