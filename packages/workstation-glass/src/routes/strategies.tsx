import { createFileRoute, Link } from "@tanstack/react-router";
import { useStrategyCatalog } from "@/hooks/use-tradeledger";
import { PageHeader, Panel } from "@/components/terminal/primitives";

export const Route = createFileRoute("/strategies")({
  head: () => ({
    meta: [
      { title: "Strategies — TradeLedger" },
      { name: "description", content: "Strategy definitions available to research runs." },
    ],
  }),
  component: StrategiesPage,
});

function StrategiesPage() {
  const catalogQuery = useStrategyCatalog();
  const strategies = catalogQuery.data?.strategies ?? [];

  return (
    <div>
      <PageHeader
        title="Strategies"
        subtitle="Strategy definitions the backend will execute for research runs. They are declarative specifications compiled server-side; user-submitted code is never executed."
      />

      <Panel
        title="Strategy catalog"
        action={<span className="text-[10px] text-muted-foreground">GET /api/v1/research/strategies</span>}
      >
        {catalogQuery.isError ? (
          <div className="flex min-h-32 flex-col items-start justify-center gap-2 p-4">
            <p className="text-[13px] font-medium">Strategy catalog unavailable</p>
            <p className="type-meta max-w-xl">
              {catalogQuery.error instanceof Error ? catalogQuery.error.message : "The backend did not return the catalog."}
              The catalog is static capability metadata, so this usually means the API is not reachable from this browser session.
            </p>
          </div>
        ) : catalogQuery.isLoading ? (
          <p className="p-4 text-[11px] text-muted-foreground">Loading catalog…</p>
        ) : strategies.length === 0 ? (
          <p className="p-4 text-[11px] text-muted-foreground">The backend reported no strategy definitions.</p>
        ) : (
          <div className="grid gap-3 p-3 md:grid-cols-2">
            {strategies.map((strategy) => (
              <div key={strategy.kind} className="border border-border bg-background/40 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-semibold">{strategy.name}</span>
                  <span className="num text-[10px] text-muted-foreground">{strategy.kind}</span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{strategy.description}</p>
                {strategy.parameters.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-[10px] text-muted-foreground">
                    {strategy.parameters.map((param) => (
                      <li key={param.key} className="leading-snug">
                        <span className="num text-foreground">{param.key}</span>
                        {" — "}{param.help}
                        {" "}<span className="num">[{param.min}…{param.max}{param.integer ? ", integer" : ""}, default {param.default}]</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-[10px] text-muted-foreground">No parameters.</p>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="How strategies run" className="mt-3">
        <div className="flex flex-col gap-2 p-4 text-[11px] leading-relaxed text-muted-foreground">
          <p>
            Every run validates a submitted specification against this catalog, fetches real historical bars for the
            chosen instrument and timeframe, and executes deterministically: a signal computed on bar N fills at bar
            N+1&apos;s open with the configured fee and slippage. There is no code execution path in the API.
          </p>
          <p>
            A persisted strategy registry does not exist yet — saved research runs record the specification and version
            they executed, so runs stay reproducible. Use the <Link to="/research" className="text-primary underline-offset-2 underline">Research</Link> workspace
            to run and compare backtests.
          </p>
        </div>
      </Panel>
    </div>
  );
}