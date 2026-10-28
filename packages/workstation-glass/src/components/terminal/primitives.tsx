import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Inbox, Loader2, PlugZap } from "lucide-react";
import { cn } from "@/lib/utils";

export function Panel({
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("panel flex min-h-0 flex-col overflow-hidden", className)}>
      {title && (
        <header className="flex h-8 shrink-0 items-center justify-between border-b px-3">
          <h2 className="type-section">{title}</h2>
          {action}
        </header>
      )}
      <div className={cn("min-h-0 flex-1", bodyClassName)}>{children}</div>
    </section>
  );
}

function State({
  icon,
  title,
  detail,
  children,
  tone = "muted",
}: {
  icon: ReactNode;
  title: string;
  detail?: ReactNode;
  children?: ReactNode;
  tone?: "muted" | "error";
}) {
  return (
    <div className="flex h-full min-h-28 flex-col items-center justify-center gap-1.5 p-4 text-center">
      <div className={tone === "error" ? "text-negative" : "text-muted-foreground"}>{icon}</div>
      <p className="text-[13px] font-medium">{title}</p>
      {detail && <p className="max-w-sm type-meta">{detail}</p>}
      {children}
    </div>
  );
}

export const LoadingState = ({ label = "Loading" }: { label?: string }) => (
  <State icon={<Loader2 className="size-5 animate-spin" aria-hidden />} title={label} />
);
export const EmptyState = ({ title, detail }: { title: string; detail?: ReactNode }) => (
  <State icon={<Inbox className="size-5" aria-hidden />} title={title} detail={detail} />
);
export const ErrorState = ({ error }: { error: unknown }) => (
  <State
    icon={<AlertTriangle className="size-5" aria-hidden />}
    tone="error"
    title="Request failed"
    detail={error instanceof Error ? error.message : String(error)}
  />
);
export const NotConnectedState = () => (
  <State
    icon={<PlugZap className="size-5" aria-hidden />}
    title="Not connected to TradeLedger API"
    detail="Set the API base URL, account and token to load live data."
  >
    <Link to="/settings" className="mt-1 text-xs font-medium text-primary hover:underline">
      Open Settings
    </Link>
  </State>
);

export function SourceBanner({ label, detail }: { label: string; detail: string }) {
  return (
    <div role="status" className="mb-3 border border-warning/35 bg-warning/8 px-3 py-2 text-[11px]">
      <span className="font-semibold tracking-wide text-warning">{label}</span>
      <span className="ml-2 text-muted-foreground">{detail}</span>
    </div>
  );
}

type Q<T> = {
  data: T | undefined;
  isLoading: boolean;
  error: unknown;
  fetchStatus: string;
  isPending: boolean;
};
/** Renders the right state for a query; `children` only runs with data. */
export function QueryView<T>({
  q,
  children,
  empty,
  emptyTitle,
  emptyDetail,
}: {
  q: Q<T>;
  children: (d: T) => ReactNode;
  empty?: (d: T) => boolean;
  emptyTitle?: string;
  emptyDetail?: ReactNode;
}) {
  if (q.isPending && q.fetchStatus === "idle") return <NotConnectedState />;
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState error={q.error} />;
  if (q.data === undefined) return <NotConnectedState />;
  if (empty?.(q.data)) {
    return (
      <EmptyState
        title={emptyTitle ?? "No records"}
        detail={emptyDetail ?? "The backend returned no data for this view."}
      />
    );
  }
  return <>{children(q.data)}</>;
}

const STATUS: Record<string, string> = {
  CREATED: "text-muted-foreground border-border",
  SUBMITTED: "text-cyan border-cyan/40",
  ACKNOWLEDGED: "text-cyan border-cyan/40 bg-cyan/10",
  PARTIALLY_FILLED: "text-warning border-warning/40 bg-warning/10",
  FILLED: "text-positive border-positive/40 bg-positive/10",
  CANCEL_REQUESTED: "text-warning border-warning/40",
  CANCELLED: "text-muted-foreground border-border bg-muted",
  REJECTED: "text-negative border-negative/40 bg-negative/10",
  EXPIRED: "text-muted-foreground border-border",
};
export function StatusBadge({ status }: { status?: string | undefined }) {
  const s = status ?? "UNKNOWN";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-1.5 py-px text-[10px] font-semibold tracking-wide",
        STATUS[s] ?? "text-muted-foreground border-border",
      )}
    >
      {s.replace(/_/g, " ")}
    </span>
  );
}

export function SideText({ side }: { side?: string | undefined }) {
  return (
    <span
      className={cn(
        "font-semibold",
        side === "BUY" ? "text-positive" : side === "SELL" ? "text-negative" : "",
      )}
    >
      {side ?? "—"}
    </span>
  );
}

export interface Column<T> {
  key: string;
  header: string;
  align?: "right";
  cell: (r: T) => ReactNode;
}
export function DataTable<T>({
  rows,
  columns,
  rowKey,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (r: T) => string;
}) {
  return (
    <div className="h-full overflow-auto">
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 bg-panel-2">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "whitespace-nowrap px-3 py-1.5 text-left text-[11px] font-medium text-muted-foreground",
                  c.align === "right" && "text-right",
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} className="h-8 border-t border-border/50 hover:bg-accent/50">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    "num whitespace-nowrap px-3 py-1",
                    c.align === "right" && "text-right",
                  )}
                >
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div>
        <h1 className="type-title">{title}</h1>
        {subtitle && <p className="type-meta mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
