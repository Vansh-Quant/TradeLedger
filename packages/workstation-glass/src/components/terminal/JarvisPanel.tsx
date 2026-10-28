import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Mic, Send } from "lucide-react";
import { useAccountContext, useOrders } from "@/hooks/use-tradeledger";
import { answer, JARVIS_DISCLOSURE, JARVIS_SUGGESTIONS, type JarvisState } from "@/lib/jarvis";
import { cn } from "@/lib/utils";

interface Msg {
  role: "user" | "jarvis";
  text: string;
}

export function JarvisOrb({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const s = size === "lg" ? "size-24" : size === "sm" ? "size-10" : "size-16";
  return (
    <div
      className={cn(
        "grid place-items-center rounded-full border border-primary/40 bg-secondary text-[10px] font-semibold tracking-widest text-primary",
        s,
      )}
      aria-hidden
    >
      J
    </div>
  );
}

function Wave() {
  return (
    <div className="flex h-5 items-end gap-0.5" aria-hidden>
      {Array.from({ length: 14 }).map((_, i) => (
        <span
          key={i}
          className="w-0.5 rounded-full bg-primary/70 animate-wave"
          style={{ height: "100%", animationDelay: `${i * 0.08}s` }}
        />
      ))}
    </div>
  );
}

/**
 * Read-only orchestration surface. It answers from backend state already on the
 * screen, routes the user, and never places orders or changes limits.
 */
export function JarvisPanel({
  initial,
  full,
  compact,
}: {
  initial?: string | undefined;
  full?: boolean;
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const ctx = useAccountContext();
  const orders = useOrders();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const ran = useRef(false);

  const state: JarvisState = {
    reachable: ctx.data !== undefined || orders.data !== undefined,
    context: ctx.data,
    orders: orders.data,
  };

  const ask = (q: string) => {
    if (!q.trim()) return;
    const reply = answer(q, state);
    setMsgs((m) => [...m, { role: "user", text: q }, { role: "jarvis", text: reply.text }]);
    setInput("");
    if (reply.destination?.to === "/trading") {
      navigate({ to: "/trading", search: { symbol: reply.destination.symbol } });
    } else if (reply.destination) {
      navigate({ to: reply.destination.to });
    }
  };

  useEffect(() => {
    if (initial && !ran.current && (ctx.data || ctx.error || ctx.fetchStatus === "idle")) {
      ran.current = true;
      ask(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, ctx.data, ctx.error, ctx.fetchStatus]);

  return (
    <div className="flex h-full flex-col">
      {!compact && (
        <div className="flex flex-col items-center gap-2 border-b p-4">
          <JarvisOrb size={full ? "lg" : "md"} />
          <div className="text-sm font-semibold tracking-wide">JARVIS</div>
          <div className="max-w-md text-center text-[11px] text-muted-foreground">
            {JARVIS_DISCLOSURE}
          </div>
          {full && <Wave />}
        </div>
      )}

      <div className="flex-1 space-y-2 overflow-auto px-3">
        {msgs.length === 0 && (
          <div className={cn("grid gap-1.5", full && "sm:grid-cols-2")}>
            {JARVIS_SUGGESTIONS.slice(0, full ? 6 : 4).map((s) => (
              <button
                key={s}
                onClick={() => ask(s)}
                className="rounded-sm border bg-secondary/60 px-3 py-2 text-left text-xs hover:border-primary"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => (
          <div
            key={i}
            className={cn(
              "max-w-[90%] rounded-sm px-3 py-2 text-xs",
              m.role === "user" ? "ml-auto bg-primary/25" : "border bg-secondary/60",
            )}
          >
            {m.text}
          </div>
        ))}
        {msgs.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t pt-2">
            {JARVIS_SUGGESTIONS.slice(0, 3).map((s) => (
              <button
                key={s}
                onClick={() => ask(s)}
                className="rounded-sm border px-2 py-1 text-[10px] text-muted-foreground hover:border-primary"
              >
                {s}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setMsgs([])}
              className="ml-auto rounded-sm px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="m-3 flex items-center gap-2 rounded-sm border bg-background/60 px-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about positions, exposure, orders…"
          className="h-9 flex-1 bg-transparent text-xs outline-none"
        />
        <button
          type="button"
          className="text-muted-foreground"
          aria-label="Voice input (not available)"
          disabled
        >
          <Mic className="size-4" />
        </button>
        <button
          type="submit"
          className="grid size-7 place-items-center rounded-sm bg-primary text-primary-foreground"
          aria-label="Send"
        >
          <Send className="size-3.5" />
        </button>
      </form>
    </div>
  );
}
