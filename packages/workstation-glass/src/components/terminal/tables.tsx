import type { Execution, Order, Position } from "@/api/types";
import { useAccountContext, useCancelOrder, useOrders } from "@/hooks/use-tradeledger";
import { money, pct, price, qty, time, tone } from "@/lib/format";
import { DataTable, QueryView, SideText, StatusBadge, type Column } from "./primitives";
import { toast } from "sonner";

const CANCELLABLE = new Set(["CREATED", "SUBMITTED", "ACKNOWLEDGED", "PARTIALLY_FILLED"]);

export function PositionTable({ compact }: { compact?: boolean }) {
  const q = useAccountContext();
  const cols: Column<Position>[] = [
    { key: "s", header: "Symbol", cell: (p) => <span className="font-sans font-semibold">{p.symbol}</span> },
    { key: "q", header: "Qty", align: "right", cell: (p) => <span className={tone(p.quantity)}>{qty(p.quantity, true)}</span> },
    ...(compact ? [] : [{ key: "side", header: "Side", cell: (p: Position) => <SideText side={p.quantity == null ? undefined : p.quantity >= 0 ? "BUY" : "SELL"} /> }]),
    { key: "a", header: "Avg Price", align: "right", cell: (p) => price(p.averagePrice) },
    { key: "m", header: "Market", align: "right", cell: (p) => price(p.marketPrice) },
    { key: "u", header: "Unrealized P&L", align: "right", cell: (p) => <span className={tone(p.unrealizedPnl)}>{p.unrealizedPnl == null ? "—" : money(p.unrealizedPnl, true)}</span> },
    { key: "p", header: "P&L %", align: "right", cell: (p) => <span className={tone(p.unrealizedPnlPct)}>{pct(p.unrealizedPnlPct)}</span> },
    ...(compact ? [] : [{ key: "e", header: "Exposure", align: "right" as const, cell: (p: Position) => (p.exposure == null ? "—" : money(p.exposure)) }]),
  ];
  return (
    <QueryView q={q} empty={(d) => d.positions.length === 0}>
      {(d) => <DataTable rows={d.positions} columns={cols} rowKey={(p) => p.symbol} />}
    </QueryView>
  );
}

export function OrderTable({ compact, activeOnly }: { compact?: boolean; activeOnly?: boolean }) {
  const q = useOrders();
  const cancel = useCancelOrder();
  const cols: Column<Order>[] = [
    ...(compact ? [] : [{ key: "id", header: "Order ID", cell: (o: Order) => <span className="text-muted-foreground">{o.orderId}</span> }]),
    { key: "s", header: "Instrument", cell: (o) => <span className="font-sans font-semibold">{o.symbol ?? "—"}</span> },
    { key: "side", header: "Side", cell: (o) => <SideText side={o.side} /> },
    { key: "t", header: "Type", cell: (o) => o.type?.replace("_", "-") ?? "—" },
    { key: "q", header: "Qty", align: "right", cell: (o) => qty(o.quantity) },
    ...(compact ? [] : [{ key: "f", header: "Filled", align: "right" as const, cell: (o: Order) => qty(o.filledQuantity) }]),
    { key: "p", header: "Price", align: "right", cell: (o) => price(o.limitPrice ?? o.stopPrice ?? o.averageFillPrice) },
    ...(compact ? [] : [{ key: "tif", header: "TIF", cell: (o: Order) => o.timeInForce ?? "—" }]),
    { key: "st", header: "Status", cell: (o) => <span title={o.rejectReason ?? undefined}><StatusBadge status={o.status} /></span> },
    ...(compact ? [] : [
      { key: "c", header: "Created", cell: (o: Order) => <span className="text-muted-foreground">{time(o.createdAt)}</span> },
      {
        key: "act", header: "Actions", align: "right" as const, cell: (o: Order) =>
          CANCELLABLE.has(String(o.status)) ? (
            <button
              disabled={cancel.isPending}
              onClick={() => cancel.mutate(o.orderId, {
                onSuccess: () => toast.success(`Cancel requested for ${o.orderId}`),
                onError: (e) => toast.error(e instanceof Error ? e.message : "Cancel failed"),
              })}
              className="rounded-sm border border-negative/40 px-2 py-0.5 font-sans text-[11px] text-negative hover:bg-negative/10 disabled:opacity-50"
            >Cancel</button>
          ) : <span className="text-muted-foreground">—</span>,
      },
    ]),
  ];
  return (
    <QueryView q={q} empty={(d) => (activeOnly ? d.filter((o) => CANCELLABLE.has(String(o.status))) : d).length === 0}>
      {(d) => <DataTable rows={activeOnly ? d.filter((o) => CANCELLABLE.has(String(o.status))) : d} columns={cols} rowKey={(o) => o.orderId} />}
    </QueryView>
  );
}

export function ExecutionTable({ compact }: { compact?: boolean }) {
  const q = useAccountContext();
  const cols: Column<Execution>[] = [
    { key: "t", header: "Time", cell: (e) => <span className="text-muted-foreground">{time(e.timestamp)}</span> },
    { key: "s", header: "Symbol", cell: (e) => <span className="font-sans font-semibold">{e.symbol ?? "—"}</span> },
    { key: "side", header: "Side", cell: (e) => <SideText side={e.side} /> },
    { key: "q", header: "Qty", align: "right", cell: (e) => qty(e.quantity) },
    { key: "p", header: "Price", align: "right", cell: (e) => price(e.price) },
    ...(compact ? [] : [
      { key: "x", header: "Execution ID", cell: (e: Execution) => <span className="text-muted-foreground">{e.executionId}</span> },
      { key: "o", header: "Order ID", cell: (e: Execution) => <span className="text-muted-foreground">{e.orderId ?? "—"}</span> },
      { key: "v", header: "Venue", cell: (e: Execution) => e.venue ?? "—" },
      { key: "f", header: "Fees", align: "right" as const, cell: (e: Execution) => (e.fees == null ? "—" : money(e.fees)) },
    ]),
  ];
  return (
    <QueryView q={q} empty={(d) => d.executions.length === 0}>
      {(d) => <DataTable rows={d.executions} columns={cols} rowKey={(e) => e.executionId} />}
    </QueryView>
  );
}
