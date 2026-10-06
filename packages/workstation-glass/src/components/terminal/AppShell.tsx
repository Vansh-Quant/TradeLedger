import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, Menu, Search } from "lucide-react";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { isConfigured, useApiConfig } from "@/api/config";
import { useAccountContext, useHealth, useOrders } from "@/hooks/use-tradeledger";
import { cn } from "@/lib/utils";
import { NAV } from "./nav";

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-8">
        <defs><linearGradient id="lg" x1="0" x2="1"><stop offset="0" stopColor="var(--primary)" /><stop offset="1" stopColor="var(--magenta)" /></linearGradient></defs>
        <path d="M16 2 30 16 16 30 2 16Z" fill="none" stroke="url(#lg)" strokeWidth="2.5" />
        <path d="M16 9 23 16 16 23 9 16Z" fill="url(#lg)" />
      </svg>
      <div className="leading-none">
        <div className="text-[15px] font-bold tracking-tight">TradeLedger</div>
        <div className="mt-0.5 whitespace-nowrap text-[8px] tracking-[0.12em] text-muted-foreground">DETERMINISTIC TRADING OS</div>
      </div>
    </Link>
  );
}

function SystemStatus() {
  const cfg = useApiConfig();
  const h = useHealth();
  const ctx = useAccountContext();
  const items: [string, boolean | undefined][] = [
    ["API Health", h.data?.health],
    ["API Ready", h.data?.ready],
    ["Account Context", ctx.data ? true : ctx.error ? false : undefined],
  ];
  return (
    <div className="panel m-2 p-2.5 text-[11px]">
      <div className="mb-1.5 font-medium text-muted-foreground">System Status</div>
      {!cfg.baseUrl ? <div className="text-muted-foreground">API not configured</div> : items.map(([k, v]) => (
        <div key={k} className="flex items-center gap-2 py-0.5">
          <span className={cn("size-1.5 rounded-full", v === true ? "bg-positive" : v === false ? "bg-negative" : "bg-muted-foreground")} />
          {k}
        </div>
      ))}
    </div>
  );
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-background/70 lg:hidden" onClick={onClose} />}
      <aside className={cn("fixed inset-y-0 left-0 z-40 flex w-52 flex-col border-r bg-background/95 backdrop-blur transition-transform lg:static lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex h-14 items-center px-4"><Logo /></div>
        <nav className="flex-1 space-y-0.5 overflow-auto px-2 py-2">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} onClick={onClose} activeOptions={{ exact: to === "/" }}
              className="relative flex items-center gap-3 rounded-md px-3 py-2 text-[13px] text-muted-foreground transition-all hover:bg-accent/40 hover:text-foreground"
              activeProps={{ className: "!text-foreground bg-linear-to-r from-primary/25 to-primary/5 shadow-[inset_0_1px_0_oklch(1_0_0/0.08),inset_2px_0_0_var(--primary)] [&>svg]:text-primary" }}>
              <Icon className="size-4" />
              <span>{label}</span>
              {label === "JARVIS" && <span className="ml-auto rounded-sm bg-primary/25 px-1 text-[9px] font-semibold text-primary">AI</span>}
            </Link>
          ))}
        </nav>
        <SystemStatus />
        <div className="px-4 pb-2 text-[10px] text-muted-foreground">TradeLedger · frontend v0.1</div>
      </aside>
    </>
  );
}

function ConnectionPill() {
  const cfg = useApiConfig();
  const h = useHealth();
  const state = !isConfigured(cfg) ? "OFFLINE" : h.isLoading ? "CONNECTING" : h.data?.health ? "LIVE" : "DISCONNECTED";
  return (
    <Link to="/settings" className={cn("flex items-center gap-1.5 rounded-sm border px-2 py-1 text-[10px] font-semibold tracking-wider",
      state === "LIVE" ? "border-positive/40 text-positive" : state === "CONNECTING" ? "border-warning/40 text-warning" : "border-negative/40 text-negative")}>
      <span className={cn("size-1.5 rounded-full", state === "LIVE" ? "bg-positive" : state === "CONNECTING" ? "bg-warning" : "bg-negative")} />
      {state}
    </Link>
  );
}

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return <span className="num hidden text-xs text-muted-foreground md:inline">{now ? now.toLocaleTimeString(undefined, { hour12: false }) : "--:--:--"}</span>;
}

function CommandPalette({ open, setOpen }: { open: boolean; setOpen: (o: boolean) => void }) {
  const navigate = useNavigate();
  const ctx = useAccountContext();
  const orders = useOrders();
  const [query, setQuery] = useState("");
  const go = (fn: () => void) => { setOpen(false); setQuery(""); fn(); };
  const sym = query.trim().toUpperCase();
  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search instruments, pages, orders, commands…" value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        {/^[A-Z.\-]{1,10}$/.test(sym) && (
          <CommandGroup heading="Instrument">
            <CommandItem value={`instrument ${sym}`} onSelect={() => go(() => navigate({ to: "/trading", search: { symbol: sym } }))}>
              Open {sym} in Trading
            </CommandItem>
          </CommandGroup>
        )}
        <CommandGroup heading="Pages">
          {NAV.map((n) => (
            <CommandItem key={n.to} value={n.label} onSelect={() => go(() => navigate({ to: n.to }))}>
              <n.icon className="mr-2 size-4" />{n.label}
            </CommandItem>
          ))}
        </CommandGroup>
        {!!ctx.data?.positions.length && (
          <CommandGroup heading="Positions">
            {ctx.data.positions.map((p) => (
              <CommandItem key={p.symbol} value={`position ${p.symbol}`} onSelect={() => go(() => navigate({ to: "/trading", search: { symbol: p.symbol } }))}>{p.symbol}</CommandItem>
            ))}
          </CommandGroup>
        )}
        {!!orders.data?.length && (
          <CommandGroup heading="Orders">
            {orders.data.slice(0, 20).map((o) => (
              <CommandItem key={o.orderId} value={`order ${o.orderId} ${o.symbol}`} onSelect={() => go(() => navigate({ to: "/orders" }))}>
                {o.orderId} · {o.side} {o.symbol} · {o.status}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandGroup heading="Commands">
          {["Show my positions", "Show my risk", "What's my current exposure?"].map((c) => (
            <CommandItem key={c} value={`jarvis ${c}`} onSelect={() => go(() => navigate({ to: "/jarvis", search: { q: c } }))}>Ask JARVIS: {c}</CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const [cmd, setCmd] = useState(false);
  const cfg = useApiConfig();
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setCmd((o) => !o); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background/60 px-3 backdrop-blur">
          <button className="lg:hidden" onClick={() => setNavOpen(true)} aria-label="Open navigation"><Menu className="size-5" /></button>
          <button onClick={() => setCmd(true)} className="panel flex h-9 w-full max-w-lg items-center gap-2 px-3 text-xs text-muted-foreground hover:border-primary/60">
            <Search className="size-4" />
            <span className="truncate">Search instruments, strategies, or commands…</span>
            <kbd className="num ml-auto rounded-sm border bg-secondary px-1.5 text-[10px]">Ctrl K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-3">
            <Clock />
            <ConnectionPill />
            <Bell className="size-4 text-muted-foreground" />
            <div className="hidden items-center gap-2 sm:flex">
              <div className="grid size-8 place-items-center rounded-full border border-primary/60 bg-primary/20 text-xs font-semibold">{(cfg.accountId || "?").slice(0, 1)}</div>
              <div className="leading-tight">
                <div className="num text-xs font-medium">{cfg.accountId || "No account"}</div>
                <div className="text-[10px] text-muted-foreground">Account</div>
              </div>
            </div>
          </div>
        </header>
        <main className="animate-page min-h-0 flex-1 overflow-auto p-3">{children}</main>
      </div>
      <CommandPalette open={cmd} setOpen={setCmd} />
    </div>
  );
}
