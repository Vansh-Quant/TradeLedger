import { createFileRoute } from "@tanstack/react-router";
import { useAccountContext } from "@/hooks/use-tradeledger";
import { money } from "@/lib/format";
import { PageHeader, Panel, QueryView } from "@/components/terminal/primitives";
import { RiskGauge } from "@/components/terminal/widgets";

export const Route = createFileRoute("/risk")({
  head: () => ({
    meta: [
      { title: "Risk — TradeLedger" },
      { name: "description", content: "Exposure, concentration, daily loss and risk limits from the backend." },
      { property: "og:title", content: "Risk — TradeLedger" },
      { property: "og:description", content: "Exposure, concentration, daily loss and risk limits from the backend." },
    ],
  }),
  component: Risk,
});

function Risk() {
  const q = useAccountContext();
  return (
    <div>
      <PageHeader title="Risk" subtitle="All values and limits are reported by the backend risk engine. Missing values show as Unavailable." />
      <QueryView q={q}>
        {(c) => {
          const largest = c.positions.reduce<number | undefined>((m, p) => (p.exposure == null ? m : Math.max(m ?? 0, Math.abs(p.exposure))), undefined);
          return (
            <div className="grid gap-3">
              <Panel title="Utilisation">
                <div className="grid grid-cols-2 sm:grid-cols-4">
                  <RiskGauge label="Gross Exposure" value={c.grossExposure} limit={c.limits.maxGrossExposure} />
                  <RiskGauge label="Net Exposure" value={c.netExposure} limit={c.limits.maxNetExposure} />
                  <RiskGauge label="Largest position exposure" value={largest} limit={c.limits.maxPositionNotional} />
                  <RiskGauge label="Daily Loss" value={c.dailyLoss} limit={c.limits.maxDailyLoss} />
                </div>
              </Panel>
              <Panel title="Limits">
                <dl className="grid divide-y divide-border/50 px-3 text-xs sm:grid-cols-2 sm:divide-y-0">
                  {([
                    ["Order Notional Limit", c.limits.maxOrderNotional],
                    ["Position Notional Limit", c.limits.maxPositionNotional],
                    ["Gross Exposure Limit", c.limits.maxGrossExposure],
                    ["Net Exposure Limit", c.limits.maxNetExposure],
                    ["Daily Loss Limit", c.limits.maxDailyLoss],
                    ["Buying Power (reported)", c.buyingPower],
                    ["Cash (reported)", c.cash],
                  ] as const).map(([k, v]) => (
                    <div key={k} className="flex justify-between py-2 sm:pr-6">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className={v == null ? "text-muted-foreground" : "num"}>{money(v)}</dd>
                    </div>
                  ))}
                </dl>
              </Panel>
            </div>
          );
        }}
      </QueryView>
    </div>
  );
}
