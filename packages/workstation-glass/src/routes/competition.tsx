import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Ban,
  CheckCircle2,
  CirclePause,
  Play,
  Power,
  ShieldAlert,
} from "lucide-react";
import { Panel, PageHeader, DataTable, EmptyState, LoadingState } from "@/components/terminal/primitives";
import { cn } from "@/lib/utils";
import { api } from "@/api/client";
import type { CompetitionSnapshot } from "@/api/types";
import { amount, describeCompetition, type StatusTone } from "@/lib/competition-view";

export const Route = createFileRoute("/competition")({
  head: () => ({
    meta: [
      { title: "Competition — TradeLedger" },
      { name: "description", content: "Competition command center, authority control, leaderboard and audit trail." },
    ],
  }),
  component: CompetitionDashboard,
});

const TONE_TEXT: Record<StatusTone, string> = {
  positive: "text-positive",
  warning: "text-warning",
  negative: "text-negative",
  muted: "text-muted-foreground",
};

const TONE_BORDER: Record<StatusTone, string> = {
  positive: "border-positive/40 text-positive",
  warning: "border-warning/40 text-warning",
  negative: "border-negative/40 text-negative",
  muted: "border-border text-muted-foreground",
};

const TONE_DOT: Record<StatusTone, string> = {
  positive: "bg-positive",
  warning: "bg-warning",
  negative: "bg-negative",
  muted: "bg-muted-foreground",
};

function Stat({ label, value, detail, tone = "muted" }: {
  label: string; value: string; detail: string; tone?: StatusTone;
}) {
  return (
    <div className="panel p-3">
      <div className="label-caps">{label}</div>
      <div className={cn("num mt-1 text-xl font-semibold", value === "—" ? "text-muted-foreground" : TONE_TEXT[tone])}>{value}</div>
      <div className="mt-1 text-[10px] text-muted-foreground">{detail}</div>
    </div>
  );
}

function CompetitionDashboard() {
  const [snapshot, setSnapshot] = useState<CompetitionSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const next = await api.competition();
        if (cancelled) return;
        setSnapshot(next);
        setLastUpdatedAt(Date.now());
        setError(null);
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : "competition backend unavailable");
      }
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const view = useMemo(
    () => describeCompetition({ snapshot, error, lastUpdatedAt, now }),
    [snapshot, error, lastUpdatedAt, now],
  );

  const runControl = async (
    action: "start" | "pause" | "resume" | "complete" | "halt" | "suspend_participant" | "resume_participant",
    participantId?: string,
  ) => {
    if (!snapshot) return;
    setBusy(true);
    try {
      await api.competitionControl(action, snapshot.competition.version, participantId);
      const next = await api.competition();
      setSnapshot(next);
      setLastUpdatedAt(Date.now());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "competition control failed");
    } finally {
      setBusy(false);
    }
  };

  const setTradingGate = async (enabled: boolean) => {
    if (!enabled && !window.confirm("Disable the trading gate for every participant?")) return;
    setBusy(true);
    try {
      await api.competitionPolicy({ tradingEnabled: enabled });
      const next = await api.competition();
      setSnapshot(next);
      setLastUpdatedAt(Date.now());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "policy update failed");
    } finally {
      setBusy(false);
    }
  };

  const setEmergencyGate = async (halt: boolean) => {
    if (halt && !window.confirm("Engage the emergency halt? All competition trading will stop.")) return;
    setBusy(true);
    try {
      await api.competitionPolicy({ emergencyHalt: halt });
      const next = await api.competition();
      setSnapshot(next);
      setLastUpdatedAt(Date.now());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "emergency control failed");
    } finally {
      setBusy(false);
    }
  };

  const toggleParticipant = (id: string, currentlySuspended: boolean) => {
    void runControl(currentlySuspended ? "resume_participant" : "suspend_participant", id);
  };

  const controlsDisabled = busy || snapshot === null;

  return (
    <div className="grid gap-3">
      <PageHeader
        title="Competition Control Center"
        subtitle={
          snapshot
            ? `${snapshot.competition.config.id} · ${snapshot.competition.config.maxParticipants.toLocaleString()}-participant capacity · backend authority`
            : "Awaiting the competition backend. Nothing is simulated on this page."
        }
        action={
          <div className={cn("flex items-center gap-2 rounded-sm border px-2.5 py-1.5 text-[10px] font-semibold tracking-wider", TONE_BORDER[view.tone])}>
            <span className={cn("size-1.5 rounded-full", TONE_DOT[view.tone])} />
            {view.status}
          </div>
        }
      />

      {error && (
        <div role="alert" className="flex flex-wrap items-baseline gap-x-2 rounded-sm border border-negative/30 bg-negative/5 px-3 py-2 text-[11px] text-negative">
          <span className="font-medium">{error}</span>
          <span className="text-muted-foreground">
            {snapshot ? "Showing the last authoritative snapshot below." : "No authoritative data is available."}
          </span>
        </div>
      )}

      {!snapshot && !error && <Panel><LoadingState label="Connecting to competition backend" /></Panel>}

      {snapshot && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            <Stat label="Participants" value={view.registered == null ? "—" : `${view.registered} / ${view.capacity ?? "—"}`} detail="registered / capacity" />
            <Stat label="Active" value={view.active == null ? "—" : String(view.active)} detail="participants in ACTIVE state" tone="positive" />
            <Stat label="Gross P&L" value={amount(view.grossPnl, true)} detail="sum of leaderboard totals" tone={view.grossPnl != null && view.grossPnl < 0 ? "negative" : "positive"} />
            <Stat label="Audit events" value={String(view.audit.length)} detail="returned by the authority" />
            <Stat label="Trading gate" value={view.policy?.tradingEnabled ? "ENABLED" : "DISABLED"} detail="policy snapshot" tone={view.policy?.tradingEnabled ? "positive" : "warning"} />
            <Stat label="Emergency halt" value={view.policy?.emergencyHalt ? "ENGAGED" : "RELEASED"} detail="policy snapshot" tone={view.policy?.emergencyHalt ? "negative" : "positive"} />
          </div>

          <div className="grid gap-3 xl:grid-cols-[1.65fr_1fr]">
            <Panel
              title="Authority Control"
              action={
                <span className="num text-[10px] text-muted-foreground">
                  policy v{view.policy?.version ?? "—"} · seq {view.sequence ?? "—"}
                </span>
              }
            >
              <div className="grid gap-3 p-3 md:grid-cols-2">
                <div className="rounded-sm border bg-background/40 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <div className="type-section">Competition Lifecycle</div>
                      <div className="type-meta">All state transitions are version checked.</div>
                    </div>
                    <Power className="size-4 text-primary" aria-hidden />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void runControl(view.status === "HALTED" ? "resume" : "start")} disabled={controlsDisabled} className="control-btn"><Play className="size-3" />Start / Resume</button>
                    <button type="button" onClick={() => void runControl("pause")} disabled={controlsDisabled} className="control-btn"><CirclePause className="size-3" />Pause</button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm("Halt the competition? Trading stops for every participant.")) void runControl("halt");
                      }}
                      disabled={controlsDisabled}
                      className="control-btn danger"
                    >
                      <Ban className="size-3" />Halt
                    </button>
                  </div>
                </div>

                <div className="rounded-sm border bg-background/40 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <div className="type-section">Trading Gate</div>
                      <div className="type-meta">Applied before risk and OMS admission.</div>
                    </div>
                    <ShieldAlert className="size-4 text-warning" aria-hidden />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => void setTradingGate(!view.policy?.tradingEnabled)} disabled={controlsDisabled} className={cn("control-btn", !view.policy?.tradingEnabled && "danger")}>
                      {view.policy?.tradingEnabled ? <CheckCircle2 className="size-3" /> : <Ban className="size-3" />}
                      Trading {view.policy?.tradingEnabled ? "Enabled" : "Disabled"}
                    </button>
                    <button type="button" onClick={() => void setEmergencyGate(!view.policy?.emergencyHalt)} disabled={controlsDisabled} className={cn("control-btn", view.policy?.emergencyHalt && "danger")}>
                      <AlertTriangle className="size-3" />Emergency {view.policy?.emergencyHalt ? "Release" : "Halt"}
                    </button>
                  </div>
                </div>

                <div className="rounded-sm border bg-background/40 p-3 md:col-span-2">
                  <div className="grid grid-cols-2 gap-3 text-[11px] md:grid-cols-4">
                    <div><div className="text-muted-foreground">Max order notional</div><div className="num mt-1 font-semibold">{amount(view.policy?.maxOrderNotional)}</div></div>
                    <div><div className="text-muted-foreground">Orders / participant / sec</div><div className="num mt-1 font-semibold">{view.policy?.maxOrdersPerParticipantPerSecond ?? "—"}</div></div>
                    <div><div className="text-muted-foreground">Allowed instruments</div><div className="num mt-1 font-semibold">{view.policy?.allowedInstruments ?? "—"}</div></div>
                    <div><div className="text-muted-foreground">Starting equity</div><div className="num mt-1 font-semibold">{amount(view.policy?.startingEquity)}</div></div>
                  </div>
                </div>
              </div>
            </Panel>

            <Panel title="Data Provenance">
              <dl className="grid gap-2 p-3 text-[11px]">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Source</dt>
                  <dd className="num">GET /api/v1/competition</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Snapshot state</dt>
                  <dd className="num">{snapshot.competition.state}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Version / sequence</dt>
                  <dd className="num">{view.version ?? "—"} / {view.sequence ?? "—"}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Last successful read</dt>
                  <dd className="num">{lastUpdatedAt == null ? "—" : new Date(lastUpdatedAt).toLocaleTimeString(undefined, { hour12: false })}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Freshness</dt>
                  <dd className={cn("num", view.stale ? "text-warning" : "text-positive")}>{view.stale ? "STALE" : "CURRENT"}</dd>
                </div>
                <p className="mt-1 border-t pt-2 text-[10px] leading-4 text-muted-foreground">
                  Every value on this page is read from the competition authority. This screen keeps no local participants,
                  events or metrics, and does not estimate values the authority does not return.
                </p>
              </dl>
            </Panel>
          </div>

          <div className="grid min-h-[420px] gap-3 xl:grid-cols-[1.8fr_1fr]">
            <Panel
              title="Leaderboard"
              action={<span className="num text-[10px] text-muted-foreground">{view.participants.length} participant(s)</span>}
            >
              {view.participants.length === 0 ? (
                <EmptyState title="No participants" detail="The competition authority reports no registered participants." />
              ) : (
                <DataTable
                  rows={view.participants}
                  rowKey={(p) => p.id}
                  columns={[
                    { key: "rank", header: "#", align: "right", cell: (p) => <span className="num">{p.rank ?? "—"}</span> },
                    { key: "participant", header: "Participant", cell: (p) => <div><div className="font-semibold">{p.id}</div><div className="text-[9px] text-muted-foreground">{p.account}</div></div> },
                    {
                      key: "state",
                      header: "State",
                      cell: (p) => (
                        <span className={cn("rounded-sm border px-1.5 py-px text-[9px] font-semibold",
                          p.state === "ACTIVE" ? "border-positive/40 text-positive"
                            : p.state === "DISQUALIFIED" ? "border-negative/40 text-negative"
                              : "border-warning/40 text-warning")}>{p.state}</span>
                      ),
                    },
                    {
                      key: "pnl",
                      header: "Total P&L",
                      align: "right",
                      cell: (p) => <span className={p.totalPnl == null ? "text-muted-foreground" : p.totalPnl < 0 ? "text-negative" : "text-positive"}>{amount(p.totalPnl, true)}</span>,
                    },
                    { key: "return", header: "Return", align: "right", cell: (p) => <span className="num">{p.returnPct == null ? "—" : `${p.returnPct.toFixed(2)}%`}</span> },
                    {
                      key: "control",
                      header: "",
                      align: "right",
                      cell: (p) => (
                        <button
                          type="button"
                          disabled={controlsDisabled}
                          onClick={() => toggleParticipant(p.id, p.state === "SUSPENDED")}
                          className="text-[9px] text-primary hover:underline disabled:opacity-40"
                        >
                          {p.state === "SUSPENDED" ? "Resume" : "Suspend"}
                        </button>
                      ),
                    },
                  ]}
                />
              )}
            </Panel>

            <Panel title="Authority Audit" action={<span className="num text-[10px] text-muted-foreground">{view.audit.length} event(s)</span>}>
              {view.audit.length === 0 ? (
                <EmptyState title="No audit events" detail="The authority returned an empty audit trail for this competition." />
              ) : (
                <div className="h-full overflow-auto">
                  {view.audit.map((entry) => (
                    <div key={`${entry.sequence}-${entry.action}`} className="border-b border-border/50 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="num text-[9px] text-muted-foreground">seq {entry.sequence}</span>
                        <span className={cn("rounded-sm border px-1.5 py-px text-[8px] font-semibold",
                          entry.outcome.toUpperCase() === "APPLIED" ? "border-primary/30 text-primary" : "border-warning/40 text-warning")}>
                          {entry.action}
                        </span>
                      </div>
                      <div className="mt-1 text-[10px] font-medium">{entry.target}</div>
                      <div className="mt-0.5 text-[9px] text-muted-foreground">
                        {entry.outcome}
                        {entry.reason ? ` · ${entry.reason}` : ""}
                        {" · "}
                        {entry.occurredAt}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          <Panel title="Control Principle">
            <div className="p-3 text-[10px] leading-5 text-muted-foreground">
              Every order passes <span className="text-foreground">competition authority → participant state → instrument policy → rate/notional limits → risk → OMS</span>.
              UI controls are only command surfaces; authoritative enforcement remains in the deterministic domain layer.
              <span className="ml-1 inline-flex items-center gap-1 text-muted-foreground"><Activity className="size-3" /> polled every 2s</span>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
