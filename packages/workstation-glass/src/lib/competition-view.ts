import type { CompetitionSnapshot } from "@/api/types";

/**
 * Derives everything the Competition screen may display from the authoritative
 * snapshot. Nothing here invents participants, activity, health or metrics:
 * absent leaderboard data stays `null` so the UI can render "—".
 */

export type CompetitionStatus =
  | "CONNECTING"
  | "LIVE"
  | "PAUSED"
  | "DRAFT"
  | "REGISTRATION"
  | "READY"
  | "HALTED"
  | "COMPLETED"
  | "CANCELLED"
  | "STALE"
  | "UNAVAILABLE";

export type StatusTone = "positive" | "warning" | "negative" | "muted";

export interface CompetitionParticipantRow {
  id: string;
  account: string;
  state: string;
  rank: number | null;
  totalPnl: number | null;
  returnPct: number | null;
}

export interface CompetitionAuditRow {
  sequence: number;
  action: string;
  target: string;
  outcome: string;
  reason: string | null;
  occurredAt: string;
}

export interface CompetitionPolicyView {
  version: number;
  tradingEnabled: boolean;
  emergencyHalt: boolean;
  allowedInstruments: number;
  maxOrderNotional: number;
  maxOrdersPerParticipantPerSecond: number;
  startingEquity: number;
}

export interface CompetitionView {
  status: CompetitionStatus;
  tone: StatusTone;
  stale: boolean;
  lastUpdatedAt: number | null;
  registered: number | null;
  capacity: number | null;
  active: number | null;
  grossPnl: number | null;
  policy: CompetitionPolicyView | null;
  version: number | null;
  sequence: number | null;
  participants: CompetitionParticipantRow[];
  audit: CompetitionAuditRow[];
}

const STATE_LABEL: Record<string, CompetitionStatus> = {
  live: "LIVE",
  paused: "PAUSED",
  halted: "HALTED",
  draft: "DRAFT",
  registration: "REGISTRATION",
  ready: "READY",
  completed: "COMPLETED",
  cancelled: "CANCELLED",
};

const STATE_TONE: Record<string, StatusTone> = {
  LIVE: "positive",
  READY: "positive",
  REGISTRATION: "warning",
  DRAFT: "muted",
  PAUSED: "warning",
  HALTED: "negative",
  CANCELLED: "negative",
  COMPLETED: "muted",
  CONNECTING: "muted",
  STALE: "warning",
  UNAVAILABLE: "negative",
};

export const DEFAULT_STALE_AFTER_MS = 15_000;

export function describeCompetition(args: {
  snapshot: CompetitionSnapshot | null;
  error: string | null;
  lastUpdatedAt: number | null;
  now: number;
  staleAfterMs?: number;
}): CompetitionView {
  const { snapshot, error, lastUpdatedAt, now } = args;
  const staleAfter = args.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;

  const stale = snapshot !== null && lastUpdatedAt !== null && now - lastUpdatedAt > staleAfter;

  let status: CompetitionStatus;
  if (snapshot === null) {
    status = error === null ? "CONNECTING" : "UNAVAILABLE";
  } else if (stale) {
    status = "STALE";
  } else {
    status = STATE_LABEL[snapshot.competition.state] ?? "PAUSED";
  }

  const empty: CompetitionView = {
    status,
    tone: STATE_TONE[status] ?? "muted",
    stale,
    lastUpdatedAt,
    registered: null,
    capacity: null,
    active: null,
    grossPnl: null,
    policy: null,
    version: null,
    sequence: null,
    participants: [],
    audit: [],
  };

  if (snapshot === null) return empty;

  const byParticipant = new Map(snapshot.leaderboard.map((entry) => [entry.participantId, entry]));

  const participants: CompetitionParticipantRow[] = snapshot.competition.participants.map(
    (participant) => {
      const entry = byParticipant.get(participant.participantId);
      return {
        id: participant.participantId,
        account: participant.accountId,
        state: participant.state.toUpperCase(),
        rank: entry?.rank ?? null,
        totalPnl: entry?.totalPnl ?? null,
        returnPct: entry?.returnPct ?? null,
      };
    },
  );

  const grossPnl =
    snapshot.leaderboard.length === 0
      ? null
      : snapshot.leaderboard.reduce((sum, entry) => sum + entry.totalPnl, 0);

  return {
    ...empty,
    registered: snapshot.competition.participants.length,
    capacity: snapshot.competition.config.maxParticipants,
    active: participants.filter((row) => row.state === "ACTIVE").length,
    grossPnl,
    policy: {
      version: snapshot.policy.version,
      tradingEnabled: snapshot.policy.tradingEnabled,
      emergencyHalt: snapshot.policy.emergencyHalt,
      allowedInstruments: snapshot.policy.allowedInstruments.length,
      maxOrderNotional: snapshot.policy.maxOrderNotional,
      maxOrdersPerParticipantPerSecond: snapshot.policy.maxOrdersPerParticipantPerSecond,
      startingEquity: snapshot.competition.config.startingEquity,
    },
    version: snapshot.competition.version,
    sequence: snapshot.competition.sequence,
    participants,
    audit: snapshot.audit.map((entry) => ({
      sequence: entry.sequence,
      action: entry.action,
      target: entry.targetId ?? "—",
      outcome: entry.outcome,
      reason: entry.reason ?? null,
      occurredAt: entry.occurredAt,
    })),
  };
}

/** Plain decimal formatting: competition config carries no currency unit. */
export function amount(value: number | null | undefined, signed = false): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : signed && value > 0 ? "+" : "";
  return `${sign}${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
