import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { CandlestickChart, Search } from "lucide-react";
import type { AccountContext, OrderType, Side, TimeInForce } from "@/api/types";
import { isConfigured, useApiConfig } from "@/api/config";
import { useAccountContext, useSubmitOrder, useWorkstationDemo } from "@/hooks/use-tradeledger";
import { money, UNAVAILABLE, tone } from "@/lib/format";
import { cn } from "@/lib/utils";
import { QueryView } from "./primitives";

export function MetricCard({ label, value, sub, valueTone, icon }: {
  label: string; value: string; sub?: ReactNode; valueTone?: string; icon?: ReactNode;
}) {
  const unavailable = value === UNAVAILABLE;
  return (
    <div className="panel panel-hover relative overflow-hidden p-3">
      <div className="pointer-events-none absolute -right-8 -top-10 size-28 rounded-full bg-primary/10 blur-2xl" />
      <div className="flex items-start justify-between">
        <span className="label-caps">{label}</span>
        {icon && <span className="grid size-7 place-items-center rounded-md border border-primary/25 bg-linear-to-b from-primary/25 to-primary/5 text-primary shadow-[inset_0_1px_0_oklch(1_0_0/0.12)]">{icon}</span>}
      </div>
      <div className={cn("num mt-1.5 text-xl font-semibold", unavailable ? "text-sm font-normal text-muted-foreground" : valueTone)}>{value}</div>
      <div className="mt-1 h-4 text-[11px] text-muted-foreground">{sub}</div>
      <div className="pointer-events-none absolute inset-x-3 bottom-0 h-px bg-gradient-primary opacity-40" />
    </div>
  );
}

/** Renders a provided numeric series. Draws nothing when no series is supplied. */
export function Sparkline({ data, className }: { data?: number[]; className?: string }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data), r = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 100},${30 - ((v - min) / r) * 28}`).join(" ");
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className={cn("h-8 w-24", className)}>
      <polyline points={pts} fill="none" stroke="var(--primary)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Chart surface awaiting a market-data provider. Never renders synthetic prices. */
export function TradingChart({ symbol }: { symbol: string }) {
  const tfs = ["1m", "5m", "15m", "1h", "4h", "1D", "1W"];
  const demo = useWorkstationDemo();
  const series = demo.data?.chart.candles ?? [];
  const last = series[series.length - 1];
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 items-center gap-3 border-b px-3">
        <span className="text-base font-semibold">{symbol || demo.data?.chart.symbol || "—"}</span>
        <span className="text-xs text-positive">{last == null ? "No quote" : last.toFixed(2)}</span>
        <div className="ml-auto flex gap-0.5">{tfs.map((t) => <span key={t} className={cn("rounded-sm px-2 py-0.5 text-[11px] text-muted-foreground", t === "15m" && "bg-primary/20 text-primary")}>{t}</span>)}</div>
      </div>
      <div className="relative flex-1 overflow-hidden" style={{ backgroundImage: "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)", backgroundSize: "60px 40px" }}>
        {series.length > 1 ? <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full p-8">
          <polyline points={series.map((v,i)=>`${(i/(series.length-1))*100},${90-((v-Math.min(...series))/((Math.max(...series)-Math.min(...series))||1))*75}`).join(" ")} fill="none" stroke="var(--primary)" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>
        </svg> : <div className="absolute inset-0 grid place-items-center"><CandlestickChart className="size-8 text-primary/70" /></div>}
        <div className="absolute bottom-2 left-3 text-[10px] text-muted-foreground">DEMO FEED · deterministic validation data</div>
      </div>
    </div>
  );
}

/** Watchlist built from symbols the account actually holds. */
export function Watchlist({ selected, onSelect }: { selected: string; onSelect: (s: string) => void }) {
  const q = useAccountContext();
  const [add, setAdd] = useState("");
  const [extra, setExtra] = useState<string[]>([]);
  return (
    <div className="flex h-full flex-col">
      <form className="flex items-center gap-2 border-b px-3 py-2" onSubmit={(e) => { e.preventDefault(); const s = add.trim().toUpperCase(); if (s) { setExtra((x) => [...new Set([...x, s])]); onSelect(s); setAdd(""); } }}>
        <Search className="size-3.5 text-muted-foreground" />
        <input value={add} onChange={(e) => setAdd(e.target.value)} placeholder="Add symbol" className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground" />
      </form>
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-3 py-1.5 text-[11px] text-muted-foreground">
        <span>Symbol</span><span className="text-right">Last</span><span className="text-right">Chg</span>
      </div>
      <div className="flex-1 overflow-auto">
        {extra.map((s) => <WatchRow key={s} symbol={s} active={selected === s} onClick={() => onSelect(s)} />)}
        {q.data?.positions.map((p) => (
          <WatchRow key={p.symbol} symbol={p.symbol} last={p.marketPrice} active={selected === p.symbol} onClick={() => onSelect(p.symbol)} />
        ))}
        {!q.data && extra.length === 0 && <p className="px-3 py-4 text-xs text-muted-foreground">Held instruments appear here when connected.</p>}
      </div>
      <p className="border-t px-3 py-1.5 text-[10px] text-muted-foreground">Change, volume and market status require a market-data feed.</p>
    </div>
  );
}
function WatchRow({ symbol, last, active, onClick }: { symbol: string; last?: number | undefined; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn("num grid w-full grid-cols-[1fr_auto_auto] gap-x-3 border-l-2 border-transparent px-3 py-1.5 text-left text-xs hover:bg-accent/40", active && "border-primary bg-accent/50")}>
      <span className="font-sans font-semibold">{symbol}</span>
      <span className="text-right">{last?.toFixed(2) ?? "—"}</span>
      <span className="text-right text-muted-foreground">—</span>
    </button>
  );
}

const TYPES: { v: OrderType; l: string }[] = [
  { v: "MARKET", l: "Market" }, { v: "LIMIT", l: "Limit" }, { v: "STOP", l: "Stop" }, { v: "STOP_LIMIT", l: "Stop-Limit" },
];
const TIFS: TimeInForce[] = ["DAY", "GTC", "IOC", "FOK"];
const field = "h-8 w-full rounded-sm border border-input bg-background/60 px-2 text-xs outline-none focus:border-primary num";

export function OrderTicket({ symbol, onSymbol }: { symbol: string; onSymbol: (s: string) => void }) {
  const cfg = useApiConfig();
  const submit = useSubmitOrder();
  const [side, setSide] = useState<Side>("BUY");
  const [type, setType] = useState<OrderType>("MARKET");
  const [quantity, setQuantity] = useState("");
  const [limit, setLimit] = useState("");
  const [stop, setStop] = useState("");
  const [tif, setTif] = useState<TimeInForce>("DAY");
  const needLimit = type === "LIMIT" || type === "STOP_LIMIT";
  const needStop = type === "STOP" || type === "STOP_LIMIT";

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    const q = Number(quantity);
    if (!symbol || !Number.isFinite(q) || q <= 0) { toast.error("Enter an instrument and a positive quantity"); return; }
    if (needLimit && !(Number(limit) > 0)) { toast.error("Limit price required"); return; }
    if (needStop && !(Number(stop) > 0)) { toast.error("Stop price required"); return; }
    submit.mutate(
      {
        accountId: cfg.accountId, symbol, side, type, quantity: q, timeInForce: tif,
        ...(needLimit ? { limitPrice: Number(limit) } : {}),
        ...(needStop ? { stopPrice: Number(stop) } : {}),
      },
      {
        onSuccess: () => { toast.success(`${side} ${q} ${symbol} submitted for backend admission`); setQuantity(""); },
        onError: (err) => toast.error(err instanceof Error ? `Rejected: ${err.message}` : "Order rejected"),
      },
    );
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2.5 p-3">
      <label className="text-[11px] text-muted-foreground">Instrument
        <input value={symbol} onChange={(e) => onSymbol(e.target.value.toUpperCase())} className={cn(field, "mt-1 font-semibold")} placeholder="e.g. AAPL" />
      </label>
      <div className="grid grid-cols-2 gap-1.5">
        {(["BUY", "SELL"] as Side[]).map((s) => (
          <button type="button" key={s} onClick={() => setSide(s)}
            className={cn("h-8 rounded-sm border text-xs font-semibold",
              s === "BUY" ? (side === s ? "border-positive bg-positive/80 text-background" : "border-positive/30 text-positive")
                : (side === s ? "border-negative bg-negative/80 text-background" : "border-negative/30 text-negative"))}>{s}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-muted-foreground">Order Type
          <select value={type} onChange={(e) => setType(e.target.value as OrderType)} className={cn(field, "mt-1")}>
            {TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-muted-foreground">Time In Force
          <select value={tif} onChange={(e) => setTif(e.target.value as TimeInForce)} className={cn(field, "mt-1")}>
            {TIFS.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
      </div>
      <label className="text-[11px] text-muted-foreground">Quantity
        <input inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={cn(field, "mt-1")} placeholder="0" />
      </label>
      <div className="grid grid-cols-4 gap-1">
        {[10, 50, 100, 500].map((n) => (
          <button type="button" key={n} onClick={() => setQuantity(String(n))} className="num h-6 rounded-sm border bg-secondary text-[11px] hover:border-primary">{n}</button>
        ))}
      </div>
      {(needLimit || needStop) && (
        <div className="grid grid-cols-2 gap-2">
          <label className={cn("text-[11px] text-muted-foreground", !needLimit && "opacity-40")}>Limit Price
            <input disabled={!needLimit} inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} className={cn(field, "mt-1")} />
          </label>
          <label className={cn("text-[11px] text-muted-foreground", !needStop && "opacity-40")}>Stop Price
            <input disabled={!needStop} inputMode="decimal" value={stop} onChange={(e) => setStop(e.target.value)} className={cn(field, "mt-1")} />
          </label>
        </div>
      )}
      <p className="text-[10px] leading-snug text-muted-foreground">Risk and admission are validated by the TradeLedger backend. No estimates are computed client-side.</p>
      <button disabled={!isConfigured(cfg) || submit.isPending}
        className="h-9 rounded-sm bg-gradient-primary text-sm font-semibold text-primary-foreground glow-primary disabled:opacity-40">
        {submit.isPending ? "Submitting…" : isConfigured(cfg) ? "Submit Order" : "Connect API to trade"}
      </button>
    </form>
  );
}

export function RiskGauge({ label, value, limit }: { label: string; value?: number | undefined; limit?: number | undefined }) {
  const ratio = value != null && limit ? Math.min(Math.abs(value) / limit, 1) : undefined;
  const r = 30, c = 2 * Math.PI * r;
  const color = ratio == null ? "var(--muted)" : ratio > 0.85 ? "var(--negative)" : ratio > 0.6 ? "var(--warning)" : "var(--magenta)";
  return (
    <div className="flex flex-col items-center gap-1 p-2 text-center">
      <svg viewBox="0 0 80 80" className="size-20 -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--muted)" strokeWidth="6" />
        {ratio != null && <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${ratio * c} ${c}`} />}
        <text x="40" y="44" textAnchor="middle" transform="rotate(90 40 40)" className="num" fill="var(--foreground)" fontSize="13" fontWeight="600">
          {ratio == null ? "N/A" : `${Math.round(ratio * 100)}%`}
        </text>
      </svg>
      <span className="text-xs font-medium">{label}</span>
      <span className="num text-[10px] text-muted-foreground">
        {value == null && limit == null ? "Unavailable" : `${value == null ? "—" : money(value)} / ${limit == null ? "—" : money(limit)}`}
      </span>
    </div>
  );
}

export function AccountSummary() {
  const q = useAccountContext();
  return (
    <QueryView q={q}>
      {(d: AccountContext) => {
        const rows: [string, number | undefined, boolean?][] = [
          ["Cash", d.cash], ["Market Value", d.marketValue], ["Total Equity", d.totalEquity],
          ["Buying Power", d.buyingPower], ["Day P&L", d.dailyPnl, true], ["Unrealized P&L", d.unrealizedPnl, true], ["Realized P&L", d.realizedPnl, true],
        ];
        return (
          <dl className="divide-y divide-border/50 px-3 py-1 text-xs">
            <div className="flex justify-between py-1.5"><dt className="text-muted-foreground">Account</dt><dd className="num">{d.accountId}</dd></div>
            {rows.map(([k, v, s]) => (
              <div key={k} className="flex justify-between py-1.5">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className={cn("num", v == null ? "text-muted-foreground" : s && tone(v))}>{money(v, s)}</dd>
              </div>
            ))}
          </dl>
        );
      }}
    </QueryView>
  );
}
