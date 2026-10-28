import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { setApiConfig, useApiConfig } from "@/api/config";
import { useHealth } from "@/hooks/use-tradeledger";
import { PageHeader, Panel } from "@/components/terminal/primitives";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — TradeLedger" },
      { name: "description", content: "Configure the TradeLedger API connection." },
      { property: "og:title", content: "Settings — TradeLedger" },
      { property: "og:description", content: "Configure the TradeLedger API connection." },
    ],
  }),
  component: Settings,
});

const field = "field-control mt-1 num";

function Settings() {
  const cfg = useApiConfig();
  const health = useHealth();
  const [form, setForm] = useState(cfg);
  useEffect(() => setForm(cfg), [cfg]);
  return (
    <div className="max-w-xl">
      <PageHeader
        title="Settings"
        subtitle="Connection to the TradeLedger HTTP API. Stored only in this browser."
      />
      <Panel title="API Connection">
        <form
          className="grid gap-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            setApiConfig({ ...form, baseUrl: form.baseUrl.trim() });
            toast.success("Connection saved");
          }}
        >
          <label className="text-[11px] text-muted-foreground">
            Base URL
            <input
              className={field}
              value={form.baseUrl}
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
              placeholder="https://api.example.com"
            />
          </label>
          <label className="text-[11px] text-muted-foreground">
            Account ID
            <input
              className={field}
              value={form.accountId}
              onChange={(e) => setForm({ ...form, accountId: e.target.value })}
            />
          </label>
          <label className="text-[11px] text-muted-foreground">
            Bearer token
            <input
              type="password"
              className={field}
              value={form.token}
              onChange={(e) => setForm({ ...form, token: e.target.value })}
              autoComplete="off"
            />
          </label>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Health:{" "}
              {!cfg.baseUrl
                ? "not configured"
                : health.isLoading
                  ? "checking…"
                  : health.data?.health
                    ? "OK"
                    : "unreachable"}{" "}
              · Ready: {health.data?.ready ? "yes" : "no"}
            </span>
            <button
              type="submit"
              className="h-8 rounded-sm bg-primary px-4 text-xs font-semibold text-primary-foreground"
            >
              Save
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Note: a backend on 127.0.0.1 is only reachable when this app runs on the same machine,
            and the API must allow this origin (CORS).
          </p>
        </form>
      </Panel>
    </div>
  );
}
