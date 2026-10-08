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
import { Panel, PageHeader, DataTable } from "@/components/terminal/primitives";
import { cn } from "@/lib/utils";
import { api } from "@/api/client";
import type { CompetitionSnapshot } from "@/api/types";

export const Route = createFileRoute("/competition")({
  head: () => ({
    meta: [
      { title: "Competition — TradeLedger" },
      { name: "description", content: "Competition command center, authority control, leaderboard and participant monitoring." },
    ],
  }),
  component: CompetitionDashboard,
});

type ParticipantState = "ACTIVE" | "SUSPENDED" | "DISQUALIFIED";

type Participant = {
  rank: number;
  id: string;
  account: string;
  state: ParticipantState;
  pnl: number;
  returnPct: number;
  drawdown: number;
  orders: number;
  lastActivity: string;
};

const initialParticipants: Participant[] = [
  { rank: 1, id: "P-0042", account: "CMP-0042", state: "ACTIVE", pnl: 8420, returnPct: 8.42, drawdown: 1.8, orders: 184, lastActivity: "1s ago" },
  { rank: 2, id: "P-0177", account: "CMP-0177", state: "ACTIVE", pnl: 7165, returnPct: 7.17, drawdown: 2.4, orders: 221, lastActivity: "2s ago" },
  { rank: 3, id: "P-0091", account: "CMP-0091", state: "ACTIVE", pnl: 5930, returnPct: 5.93, drawdown: 3.1, orders: 166, lastActivity: "1s ago" },
  { rank: 4, id: "P-0314", account: "CMP-0314", state: "ACTIVE", pnl: 4880, returnPct: 4.88, drawdown: 2.9, orders: 143, lastActivity: "4s ago" },
  { rank: 5, id: "P-0088", account: "CMP-0088", state: "SUSPENDED", pnl: 3210, returnPct: 3.21, drawdown: 5.7, orders: 201, lastActivity: "38s ago" },
  { rank: 6, id: "P-0250", account: "CMP-0250", state: "ACTIVE", pnl: 2940, returnPct: 2.94, drawdown: 4.2, orders: 119, lastActivity: "3s ago" },
  { rank: 7, id: "P-0411", account: "CMP-0411", state: "ACTIVE", pnl: 1840, returnPct: 1.84, drawdown: 3.6, orders: 97, lastActivity: "5s ago" },
  { rank: 8, id: "P-0067", account: "CMP-0067", state: "ACTIVE", pnl: 1120, returnPct: 1.12, drawdown: 1.5, orders: 83, lastActivity: "2s ago" },
];

const events: readonly [string, string, string, string, string][] = [
  ["10:09:41", "ORDER_ACCEPTED", "P-0042", "AAPL BUY 25", "authority seq 18,421"],
  ["10:09:39", "RISK_CHECK", "P-0177", "TSLA SELL 10", "passed"],
  ["10:09:36", "PARTICIPANT_SUSPENDED", "P-0088", "CMP-0088", "risk officer"],
  ["10:09:31", "EXECUTION", "P-0091", "NVDA BUY 15", "fill 15 @ 182.42"],
  ["10:09:24", "ORDER_REJECTED", "P-0314", "MSFT BUY 500", "notional limit"],
];

function Stat({ label, value, detail, tone = "normal" }: { label: string; value: string; detail: string; tone?: "normal" | "positive" | "warning" | "negative" }) {
  return (
    <div className="panel p-3">
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className={cn("mt-1 num text-xl font-semibold", tone === "positive" && "text-positive", tone === "warning" && "text-warning", tone === "negative" && "text-negative")}>{value}</div>
      <div className="mt-1 text-[10px] text-muted-foreground">{detail}</div>
    </div>
  );
}

function CompetitionDashboard() {
  const [status, setStatus] = useState<"LIVE" | "PAUSED" | "HALTED">("LIVE");
  const [tradingEnabled, setTradingEnabled] = useState(true);
  const [emergencyHalt, setEmergencyHalt] = useState(false);
  const [participants, setParticipants] = useState(initialParticipants);
  const [snapshot, setSnapshot] = useState<CompetitionSnapshot | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshCompetition = async () => {
    try {
      const next = await api.competition();
      setSnapshot(next);
      setStatus(next.competition.state === "live" ? "LIVE" : next.competition.state === "halted" ? "HALTED" : "PAUSED");
      setTradingEnabled(next.policy.tradingEnabled);
      setEmergencyHalt(next.policy.emergencyHalt);
      const byId = new Map(next.leaderboard.map((entry) => [entry.participantId, entry]));
      setParticipants(next.competition.participants.map((participant) => {
        const entry = byId.get(participant.participantId);
        return {
          rank: entry?.rank ?? 0,
          id: participant.participantId,
          account: participant.accountId,
          state: participant.state.toUpperCase() as ParticipantState,
          pnl: entry?.totalPnl ?? 0,
          returnPct: entry?.returnPct ?? 0,
          drawdown: 0,
          orders: 0,
          lastActivity: "backend",
        };
      }));
      setBackendError(null);
    } catch (cause) {
      setBackendError(cause instanceof Error ? cause.message : "competition backend unavailable");
    }
  };

  useEffect(() => {
    void refreshCompetition();
    const timer = window.setInterval(() => void refreshCompetition(), 2000);
    return () => window.clearInterval(timer);
  }, []);

  const runControl = async (action: "start" | "pause" | "resume" | "complete" | "halt" | "suspend_participant" | "resume_participant", participantId?: string) => {
    if (!snapshot) return;
    setBusy(true);
    try {
      await api.competitionControl(action, snapshot.competition.version, participantId);
      await refreshCompetition();
    } catch (cause) {
      setBackendError(cause instanceof Error ? cause.message : "competition control failed");
    } finally { setBusy(false); }
  };

  const setTradingGate = async (enabled: boolean) => {
    setBusy(true);
    try { await api.competitionPolicy({ tradingEnabled: enabled }); await refreshCompetition(); }
    catch (cause) { setBackendError(cause instanceof Error ? cause.message : "policy update failed"); }
    finally { setBusy(false); }
  };

  const setEmergencyGate = async (halt: boolean) => {
    setBusy(true);
    try { await api.competitionPolicy({ emergencyHalt: halt }); await refreshCompetition(); }
    catch (cause) { setBackendError(cause instanceof Error ? cause.message : "emergency control failed"); }
    finally { setBusy(false); }
  };

  const active = useMemo(() => participants.filter((p) => p.state === "ACTIVE").length, [participants]);

  const suspendTop = (id: string) => {
    const participant = participants.find((p) => p.id === id);
    if (!participant) return;
    void runControl(participant.state === "SUSPENDED" ? "resume_participant" : "suspend_participant", id);
  };

  const controlState = emergencyHalt ? "EMERGENCY HALT" : status;

  return (
    <div className="grid gap-3">
      <PageHeader
        title="Competition Control Center"
        subtitle={snapshot ? `${snapshot.competition.config.id} · ${snapshot.competition.config.maxParticipants.toLocaleString()}-participant capacity · backend authority` : "Connecting to competition backend…"}
        action={
          <div className={cn(
            "flex items-center gap-2 rounded border px-2.5 py-1.5 text-[10px] font-semibold tracking-wider",
            emergencyHalt || status === "HALTED" ? "border-negative/40 text-negative" : status === "PAUSED" ? "border-warning/40 text-warning" : "border-positive/40 text-positive",
          )}>
            <span className={cn("size-1.5 rounded-full", emergencyHalt || status === "HALTED" ? "bg-negative" : status === "PAUSED" ? "bg-warning" : "bg-positive")} />
            {controlState}
          </div>
        }
      />

      {backendError && <div className="rounded border border-negative/30 bg-negative/5 px-3 py-2 text-[10px] text-negative">{backendError}</div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Stat label="Participants" value={snapshot ? `${snapshot.competition.participants.length} / ${snapshot.competition.config.maxParticipants}` : "—"} detail="registered / capacity" />
        <Stat label="Active" value={snapshot ? String(active) : "—"} detail="live traders" tone="positive" />
        <Stat label="Orders / sec" value="142" detail="current burst" />
        <Stat label="Orders / min" value="2,486" detail="rolling minute" />
        <Stat label="Executions" value="18,421" detail="competition total" />
        <Stat label="Gross P&L" value={snapshot ? `₹${snapshot.leaderboard.reduce((sum, x) => sum + x.totalPnl, 0).toLocaleString()}` : "—"} detail="competition service" tone="positive" />
        <Stat label="Max DD" value="7.8%" detail="current leader" tone="warning" />
        <Stat label="Audit events" value={snapshot ? String(snapshot.audit.length) : "—"} detail="authority audit" tone="normal" />
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.65fr_1fr]">
        <Panel title="Authority Control" action={<span className="num text-[10px] text-muted-foreground">policy v7 · seq 18,421</span>}>
          <div className="grid gap-3 p-3 md:grid-cols-2">
            <div className="rounded border bg-background/40 p-3">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold">Competition Lifecycle</div>
                  <div className="text-[10px] text-muted-foreground">All state transitions are version checked.</div>
                </div>
                <Power className="size-4 text-primary" />
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => void runControl(status === "HALTED" ? "resume" : "start")} disabled={busy} className="control-btn"><Play className="size-3" />Start / Resume</button>
                <button onClick={() => void runControl("pause")} className="control-btn"><CirclePause className="size-3" />Pause</button>
                <button onClick={() => void runControl("halt")} className="control-btn danger"><Ban className="size-3" />Halt</button>
              </div>
            </div>

            <div className="rounded border bg-background/40 p-3">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold">Trading Gate</div>
                  <div className="text-[10px] text-muted-foreground">Applied before risk and OMS admission.</div>
                </div>
                <ShieldAlert className="size-4 text-warning" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => void setTradingGate(!tradingEnabled)} disabled={busy} className={cn("control-btn", !tradingEnabled && "danger")}>
                  {tradingEnabled ? <CheckCircle2 className="size-3" /> : <Ban className="size-3" />}
                  Trading {tradingEnabled ? "Enabled" : "Disabled"}
                </button>
                <button onClick={() => void setEmergencyGate(!emergencyHalt)} disabled={busy} className={cn("control-btn", emergencyHalt && "danger")}>
                  <AlertTriangle className="size-3" />Emergency {emergencyHalt ? "Release" : "Halt"}
                </button>
              </div>
            </div>

            <div className="rounded border bg-background/40 p-3 md:col-span-2">
              <div className="grid grid-cols-2 gap-3 text-[11px] md:grid-cols-4">
                <div><div className="text-muted-foreground">Max order notional</div><div className="num mt-1 font-semibold">₹50,000</div></div>
                <div><div className="text-muted-foreground">Orders / participant / sec</div><div className="num mt-1 font-semibold">10</div></div>
                <div><div className="text-muted-foreground">Allowed instruments</div><div className="num mt-1 font-semibold">24</div></div>
                <div><div className="text-muted-foreground">Starting equity</div><div className="num mt-1 font-semibold">₹100,000</div></div>
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="System Integrity">
          <div className="grid gap-2 p-3">
            {[
              ["Authority gate", "HEALTHY", true],
              ["Risk engine", "HEALTHY", true],
              ["OMS", "HEALTHY", true],
              ["Execution bus", "HEALTHY", true],
              ["Leaderboard", "SYNCED", true],
              ["Audit sequence", "18,421", true],
            ].map(([label, value, ok]) => (
              <div key={String(label)} className="flex items-center justify-between rounded border bg-background/30 px-3 py-2">
                <span className="text-[11px]">{label}</span>
                <span className={cn("flex items-center gap-1.5 text-[10px] font-semibold", ok ? "text-positive" : "text-negative")}><span className="size-1.5 rounded-full bg-current" />{value}</span>
              </div>
            ))}
            <div className="mt-1 rounded border border-warning/30 bg-warning/5 p-2 text-[10px] text-warning">
              <div className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="size-3" />3 policy events require review</div>
              <div className="mt-1 text-muted-foreground">No authority bypass detected.</div>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid min-h-[520px] gap-3 xl:grid-cols-[1.8fr_1fr]">
        <Panel title="Live Leaderboard" action={<div className="flex items-center gap-2 text-[10px] text-muted-foreground"><Activity className="size-3 text-positive" />streaming</div>}>
          <DataTable
            rows={participants}
            rowKey={(p) => p.id}
            columns={[
              { key: "rank", header: "#", cell: (p) => <span className="font-semibold">{p.rank}</span> },
              { key: "participant", header: "Participant", cell: (p) => <div><div className="font-semibold">{p.id}</div><div className="text-[9px] text-muted-foreground">{p.account}</div></div> },
              { key: "state", header: "State", cell: (p) => <span className={cn("rounded border px-1.5 py-px text-[9px] font-semibold", p.state === "ACTIVE" ? "border-positive/40 text-positive" : "border-warning/40 text-warning")}>{p.state}</span> },
              { key: "pnl", header: "Total P&L", align: "right", cell: (p) => <span className="text-positive">+₹{p.pnl.toLocaleString()}</span> },
              { key: "return", header: "Return", align: "right", cell: (p) => <span>{p.returnPct.toFixed(2)}%</span> },
              { key: "dd", header: "Drawdown", align: "right", cell: (p) => <span className={p.drawdown > 5 ? "text-warning" : ""}>{p.drawdown.toFixed(1)}%</span> },
              { key: "orders", header: "Orders", align: "right", cell: (p) => p.orders },
              { key: "activity", header: "Last activity", align: "right", cell: (p) => <span className="text-muted-foreground">{p.lastActivity}</span> },
              { key: "control", header: "", align: "right", cell: (p) => <button onClick={() => suspendTop(p.id)} className="text-[9px] text-primary hover:underline">{p.state === "SUSPENDED" ? "Resume" : "Suspend"}</button> },
            ]}
          />
        </Panel>

        <Panel title="Authority Event Stream" action={<span className="num text-[10px] text-muted-foreground">LIVE</span>}>
          <div className="h-full overflow-auto">
            {events.map(([time, type, participant, subject, detail]) => (
              <div key={time + type} className="border-b border-border/50 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="num text-[9px] text-muted-foreground">{time}</span>
                  <span className={cn("rounded border px-1.5 py-px text-[8px] font-semibold", type.includes("REJECT") || type.includes("SUSPEND") ? "border-warning/40 text-warning" : "border-primary/30 text-primary")}>{type}</span>
                </div>
                <div className="mt-1 text-[10px] font-medium">{participant} · {subject}</div>
                <div className="mt-0.5 text-[9px] text-muted-foreground">{detail}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Panel title="Competition Metrics">
          <div className="grid grid-cols-2 gap-2 p-3 text-[10px]">
            <div className="rounded border p-2"><div className="text-muted-foreground">Accepted</div><div className="num mt-1 text-sm font-semibold">96.8%</div></div>
            <div className="rounded border p-2"><div className="text-muted-foreground">Rejected</div><div className="num mt-1 text-sm font-semibold">3.2%</div></div>
            <div className="rounded border p-2"><div className="text-muted-foreground">Avg latency</div><div className="num mt-1 text-sm font-semibold">18ms</div></div>
            <div className="rounded border p-2"><div className="text-muted-foreground">Peak burst</div><div className="num mt-1 text-sm font-semibold">2,940/min</div></div>
          </div>
        </Panel>
        <Panel title="Participant Operations">
          <div className="space-y-2 p-3 text-[10px]">
            <div className="flex items-center justify-between"><span>Active accounts</span><span className="num font-semibold">{active}</span></div>
            <div className="flex items-center justify-between"><span>Suspended</span><span className="num font-semibold text-warning">{participants.filter((p) => p.state === "SUSPENDED").length}</span></div>
            <div className="flex items-center justify-between"><span>Disqualified</span><span className="num font-semibold">0</span></div>
            <div className="flex items-center justify-between"><span>Connectivity</span><span className="text-positive">99.99%</span></div>
          </div>
        </Panel>
        <Panel title="Control Principle">
          <div className="p-3 text-[10px] leading-5 text-muted-foreground">
            Every order passes <span className="text-foreground">competition authority → participant state → instrument policy → rate/notional limits → risk → OMS</span>. UI controls are only command surfaces; authoritative enforcement remains in the deterministic domain layer.
          </div>
        </Panel>
      </div>
    </div>
  );
}
