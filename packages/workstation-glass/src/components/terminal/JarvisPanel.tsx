import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Mic, Send } from "lucide-react";
import { useAccountContext, useOrders } from "@/hooks/use-tradeledger";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

export const JARVIS_SUGGESTIONS = [
  "Show my positions", "What's my current exposure?", "Explain this order", "Summarize today's trading",
  "Analyze AAPL", "Show my risk", "Why was this order rejected?",
];

interface Msg { role: "user" | "jarvis"; text: string }

export function JarvisOrb({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const s = size === "lg" ? "size-36" : size === "sm" ? "size-16" : "size-24";
  return (
    <div className={cn("relative", s)}>
      <div className="absolute inset-0 rounded-full animate-orb" style={{ background: "conic-gradient(from 0deg, var(--primary), var(--magenta), var(--cyan), var(--primary))", mask: "radial-gradient(circle, transparent 58%, black 60%)" }} />
      <div className="absolute inset-[18%] rounded-full bg-background" style={{ boxShadow: "inset 0 0 24px color-mix(in oklab, var(--primary) 50%, transparent), var(--glow-primary)" }} />
    </div>
  );
}

function Wave() {
  return (
    <div className="flex h-5 items-end gap-0.5">
      {Array.from({ length: 14 }).map((_, i) => (
        <span key={i} className="w-0.5 rounded-full bg-primary/70 animate-wave" style={{ height: "100%", animationDelay: `${i * 0.08}s` }} />
      ))}
    </div>
  );
}

/**
 * JARVIS orchestrates requests: it reads backend state through the API client and
 * routes the user. It never makes trading or risk decisions.
 */
export function JarvisPanel({ initial, full }: { initial?: string | undefined; full?: boolean }) {
  const navigate = useNavigate();
  const ctx = useAccountContext();
  const orders = useOrders();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const ran = useRef(false);

  const respond = (q: string): string => {
    const t = q.toLowerCase();
    const c = ctx.data;
    if (!c && !orders.data) return "I can't reach the TradeLedger API yet. Configure the connection in Settings.";
    if (t.includes("position")) {
      navigate({ to: "/positions" });
      return c?.positions.length ? `You hold ${c.positions.length} position(s): ${c.positions.map((p) => p.symbol).join(", ")}. Opened Positions.` : "The backend reports no open positions.";
    }
    if (t.includes("exposure")) return `Gross exposure: ${money(c?.grossExposure)}. Net exposure: ${money(c?.netExposure)}. (Values as reported by the backend.)`;
    if (t.includes("risk")) { navigate({ to: "/risk" }); return "Opened the Risk dashboard with backend-reported limits and utilisation."; }
    if (t.includes("reject")) {
      const r = orders.data?.find((o) => o.status === "REJECTED");
      return r ? `Most recent rejected order ${r.orderId} (${r.side} ${r.symbol}): ${r.rejectReason ?? "the backend did not provide a reason."}` : "No rejected orders found.";
    }
    if (t.includes("summar")) return `Account ${c?.accountId ?? "—"}: equity ${money(c?.totalEquity)}, day P&L ${money(c?.dailyPnl, true)}, ${orders.data?.length ?? 0} order(s), ${c?.executions.length ?? 0} execution(s).`;
    const m = q.match(/analy[sz]e\s+([a-z.\-]+)/i);
    if (m) { navigate({ to: "/trading", search: { symbol: m[1]!.toUpperCase() } }); return `Opened ${m[1]!.toUpperCase()} in Trading. Analysis agents are not connected yet.`; }
    return "That request needs a JARVIS agent tool that the backend doesn't expose yet.";
  };

  const ask = (q: string) => {
    if (!q.trim()) return;
    setMsgs((m) => [...m, { role: "user", text: q }, { role: "jarvis", text: respond(q) }]);
    setInput("");
  };

  useEffect(() => {
    if (initial && !ran.current && (ctx.data || ctx.error || ctx.fetchStatus === "idle")) { ran.current = true; ask(initial); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, ctx.data, ctx.error, ctx.fetchStatus]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col items-center gap-2 p-4">
        <JarvisOrb size={full ? "lg" : "md"} />
        <div className="text-lg font-semibold tracking-wide">JARVIS</div>
        <div className="text-[11px] text-muted-foreground">Orchestration layer · reads backend state</div>
        <Wave />
      </div>
      <div className="flex-1 space-y-2 overflow-auto px-3">
        {msgs.length === 0 && (
          <div className={cn("grid gap-1.5", full && "sm:grid-cols-2")}>
            {JARVIS_SUGGESTIONS.slice(0, full ? 7 : 5).map((s) => (
              <button key={s} onClick={() => ask(s)} className="rounded-sm border bg-secondary/60 px-3 py-2 text-left text-xs hover:border-primary">{s}</button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={cn("max-w-[90%] rounded-sm px-3 py-2 text-xs", m.role === "user" ? "ml-auto bg-primary/25" : "border bg-secondary/60")}>{m.text}</div>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="m-3 flex items-center gap-2 rounded-sm border bg-background/60 px-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask anything…" className="h-9 flex-1 bg-transparent text-xs outline-none" />
        <button type="button" className="text-muted-foreground" aria-label="Voice (unavailable)" disabled><Mic className="size-4" /></button>
        <button className="grid size-7 place-items-center rounded-sm bg-gradient-primary text-primary-foreground" aria-label="Send"><Send className="size-3.5" /></button>
      </form>
    </div>
  );
}
