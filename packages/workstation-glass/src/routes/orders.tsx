import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Panel } from "@/components/terminal/primitives";
import { OrderTable } from "@/components/terminal/tables";

export const Route = createFileRoute("/orders")({
  head: () => ({
    meta: [
      { title: "Orders — TradeLedger" },
      { name: "description", content: "Order management with lifecycle status and cancellation." },
      { property: "og:title", content: "Orders — TradeLedger" },
      {
        property: "og:description",
        content: "Order management with lifecycle status and cancellation.",
      },
    ],
  }),
  component: OrdersPage,
});

function OrdersPage() {
  return (
    <div>
      <PageHeader
        title="Orders"
        subtitle="Live order list from GET /api/v1/accounts/{accountId}/orders. Cancellation posts to the existing order action API."
      />
      <Panel title="All Orders" className="h-[calc(100vh-9rem)]">
        <OrderTable />
      </Panel>
    </div>
  );
}
