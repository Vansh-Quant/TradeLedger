import {
  applyCompetitionControl,
  authorizeCompetitionCapability,
  authorizeCompetitionOrderWithState,
  buildCompetitionLeaderboard,
  createCompetition,
  createCompetitionEngineState,
  createCompetitionPolicy,
  createCompetitionAuditEvent,
  appendCompetitionAudit,
  registerAuthorizedParticipant,
  updateCompetitionPolicy,
  type Competition,
  type CompetitionConfig,
  type CompetitionEngineState,
  type CompetitionPolicy,
  type CompetitionPrincipal,
  type CompetitionParticipant,
  type ControlAction,
  type CompetitionCapability,
  type CompetitionAuditEvent,
} from "@tradeledger/domain";
import type { ApplicationPrincipal } from "./contracts.js";
import { AuthorizationError, NotFoundError, ValidationError } from "./errors.js";

function principalForCompetition(principal: ApplicationPrincipal): CompetitionPrincipal {
  const roles = principal.roles.filter((role): role is CompetitionPrincipal["roles"][number] =>
    ["owner", "operator", "risk_officer", "judge", "observer", "participant"].includes(role),
  );
  return Object.freeze({
    principalId: principal.id,
    roles: Object.freeze(roles),
    disabled: false,
  });
}

function requireString(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new ValidationError(field + " must not be empty");
  return normalized;
}

function requireFinite(value: number, field: string): number {
  if (!Number.isFinite(value)) throw new ValidationError(field + " must be finite");
  return value;
}

export interface CompetitionCreateCommand {
  readonly principal: ApplicationPrincipal;
  readonly config: CompetitionConfig;
  readonly now?: string;
}

export interface CompetitionControlCommand {
  readonly principal: ApplicationPrincipal;
  readonly action: ControlAction;
  readonly expectedVersion: number;
  readonly requestId: string;
  readonly participantId?: string;
}

export interface CompetitionRegistrationCommand {
  readonly principal: ApplicationPrincipal;
  readonly participantId: string;
  readonly accountId: string;
  readonly registeredAt?: string;
}

export interface CompetitionOrderAuthorizationCommand {
  readonly principal: ApplicationPrincipal;
  readonly participantId: string;
  readonly instrumentId: string;
  readonly orderNotional: number;
  readonly second: number;
}

export interface CompetitionPerformanceUpdateCommand {
  readonly principal: ApplicationPrincipal;
  readonly participantId: string;
  readonly realizedPnl: number;
  readonly unrealizedPnl: number;
}

export interface CompetitionPolicyUpdateCommand {
  readonly principal: ApplicationPrincipal;
  readonly patch: Partial<Omit<CompetitionPolicy, "version">>;
}

export interface CompetitionSnapshot {
  readonly competition: Competition;
  readonly policy: CompetitionPolicy;
  readonly leaderboard: ReturnType<typeof buildCompetitionLeaderboard>;
  readonly audit: readonly CompetitionAuditEvent[];
}

export interface CompetitionControlResult {
  readonly applied: boolean;
  readonly reason: string;
  readonly competition: Competition;
}

export class CompetitionApplicationService {
  private competition: Competition | undefined;
  private engine: CompetitionEngineState | undefined;
  private policy: CompetitionPolicy | undefined;
  private audit: readonly CompetitionAuditEvent[] = [];
  private auditSequence = 0;

  create(command: CompetitionCreateCommand): CompetitionSnapshot {
    this.requireCapability(command.principal, "competition.start");
    if (this.competition !== undefined) {
      throw new ValidationError("competition already exists");
    }
    const now = command.now ?? new Date().toISOString();
    this.competition = createCompetition(command.config, now);
    this.policy = createCompetitionPolicy({
      tradingEnabled: true,
      emergencyHalt: false,
      allowedInstruments: command.config.allowedInstruments,
      maxOrderNotional: command.config.maxOrderNotional,
      maxOrdersPerParticipantPerSecond: command.config.maxOrdersPerParticipantPerSecond,
    });
    this.engine = createCompetitionEngineState(this.competition);
    this.appendAudit(command.principal, "competition_state_change", command.config.id, "applied", "created", undefined);
    return this.snapshot();
  }

  get(principal: ApplicationPrincipal): CompetitionSnapshot {
    this.requireCapability(principal, "competition.view");
    if (!this.competition || !this.policy || !this.engine) throw new NotFoundError("competition was not found");
    return this.snapshot();
  }

  register(command: CompetitionRegistrationCommand): CompetitionSnapshot {
    this.requireCapability(command.principal, "competition.register");
    const competition = this.requireCompetition();
    const registeredAt = command.registeredAt ?? new Date().toISOString();
    const participant: CompetitionParticipant = Object.freeze({
      participantId: requireString(command.participantId, "participantId"),
      accountId: requireString(command.accountId, "accountId"),
      state: "registered",
      registeredAt,
    });
    const result = registerAuthorizedParticipant(competition, principalForCompetition(command.principal), participant);
    if (!result.registered) throw new AuthorizationError(result.reason);
    this.replaceCompetition(result.competition);
    this.rebuildEngine();
    this.appendAudit(command.principal, "participant_state_change", participant.participantId, "applied", "registered", undefined);
    return this.snapshot();
  }

  prepare(principal: ApplicationPrincipal, requestId: string): CompetitionControlResult {
    return this.control({ principal, action: "start", expectedVersion: this.requireCompetition().version, requestId, participantId: undefined }, true);
  }

  control(command: CompetitionControlCommand, prepareOnly = false): CompetitionControlResult {
    const competition = this.requireCompetition();
    const principal = principalForCompetition(command.principal);
    const capability = this.capabilityForAction(command.action);
    this.requireCapability(command.principal, capability);

    if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 0) {
      throw new ValidationError("expectedVersion must be a non-negative integer");
    }
    const requestId = requireString(command.requestId, "requestId");

    if (prepareOnly) {
      if (competition.state !== "registration" || competition.participants.length === 0) {
        throw new ValidationError("competition requires registration and at least one participant");
      }
      const prepared = { ...competition, state: "ready" as const, version: competition.version + 1, sequence: competition.sequence + 1, participants: Object.freeze([...competition.participants]) };
      this.replaceCompetition(Object.freeze(prepared));
      this.appendAudit(command.principal, "competition_state_change", competition.config.id, "applied", "prepared", requestId);
      return Object.freeze({ applied: true, reason: "allowed", competition: this.requireCompetition() });
    }

    const result = applyCompetitionControl(competition, {
      requestId,
      principal,
      action: command.action,
      expectedVersion: command.expectedVersion,
      ...(command.participantId === undefined ? {} : { participantId: command.participantId }),
    });

    if (!result.applied) {
      this.appendAudit(command.principal, "control", competition.config.id, "denied", result.reason, requestId);
      return Object.freeze(result);
    }

    this.replaceCompetition(result.competition);
    this.rebuildEngine();
    this.appendAudit(command.principal, "competition_state_change", competition.config.id, "applied", command.action, requestId);
    return Object.freeze(result);
  }

  updatePolicy(command: CompetitionPolicyUpdateCommand): CompetitionSnapshot {
    this.requireCapability(command.principal, "policy.update");
    const current = this.policy;
    if (!current) throw new NotFoundError("competition was not found");
    this.policy = updateCompetitionPolicy(current, command.patch);
    this.appendAudit(command.principal, "policy_change", this.requireCompetition().config.id, "applied", "policy updated", undefined);
    return this.snapshot();
  }

  authorizeOrder(command: CompetitionOrderAuthorizationCommand) {
    this.requireCapability(command.principal, "competition.view");
    const engine = this.engine;
    if (!engine) throw new NotFoundError("competition was not found");
    const participantId = requireString(command.participantId, "participantId");
    const instrumentId = requireString(command.instrumentId, "instrumentId");
    const orderNotional = requireFinite(command.orderNotional, "orderNotional");
    if (!Number.isSafeInteger(command.second) || command.second < 0) {
      throw new ValidationError("second must be a non-negative integer");
    }

    const result = authorizeCompetitionOrderWithState(engine, {
      participantId,
      instrumentId,
      orderNotional,
      second: command.second,
    });
    this.engine = result.state;
    this.appendAudit(
      command.principal,
      "order_authorization",
      participantId,
      result.decision.allowed ? "allowed" : "denied",
      result.decision.reason,
      undefined,
      result.decision.policyVersion,
    );
    return Object.freeze(result);
  }

  updatePerformance(command: CompetitionPerformanceUpdateCommand): CompetitionSnapshot {
    this.requireCapability(command.principal, "competition.view");
    if (!this.engine) throw new NotFoundError("competition was not found");
    const participantId = requireString(command.participantId, "participantId");
    this.engine = Object.freeze({
      ...this.engine,
      performance: Object.freeze(this.engine.performance.map((entry) =>
        entry.participantId === participantId
          ? Object.freeze({
              ...entry,
              realizedPnl: requireFinite(command.realizedPnl, "realizedPnl"),
              unrealizedPnl: requireFinite(command.unrealizedPnl, "unrealizedPnl"),
            })
          : entry,
      )),
    });
    if (!this.engine.performance.some((entry) => entry.participantId === participantId)) {
      throw new NotFoundError("participant was not found");
    }
    return this.snapshot();
  }

  private requireCapability(principal: ApplicationPrincipal, capability: CompetitionCapability): void {
    const decision = authorizeCompetitionCapability(principalForCompetition(principal), capability);
    if (!decision.allowed) throw new AuthorizationError(decision.reason);
  }

  private capabilityForAction(action: ControlAction): CompetitionCapability {
    const map: Record<ControlAction, CompetitionCapability> = {
      start: "competition.start",
      pause: "competition.pause",
      resume: "competition.resume",
      complete: "competition.complete",
      halt: "competition.halt",
      suspend_participant: "participant.suspend",
      resume_participant: "participant.resume",
      liquidate_participant: "participant.liquidate",
    };
    return map[action];
  }

  private requireCompetition(): Competition {
    if (!this.competition) throw new NotFoundError("competition was not found");
    return this.competition;
  }

  private replaceCompetition(next: Competition): void {
    this.competition = Object.freeze(next);
  }

  private rebuildEngine(): void {
    const competition = this.requireCompetition();
    const previous = this.engine;
    const rebuilt = createCompetitionEngineState(competition);
    if (!previous) {
      this.engine = rebuilt;
      return;
    }
    this.engine = Object.freeze({
      ...rebuilt,
      performance: Object.freeze(rebuilt.performance.map((entry) => {
        const old = previous.performance.find((candidate) => candidate.participantId === entry.participantId);
        return old === undefined ? entry : Object.freeze({ ...entry, realizedPnl: old.realizedPnl, unrealizedPnl: old.unrealizedPnl });
      })),
      orderCounts: previous.orderCounts,
      second: previous.second,
    });
  }

  private appendAudit(
    principal: ApplicationPrincipal,
    action: CompetitionAuditEvent["action"],
    targetId: string,
    outcome: CompetitionAuditEvent["outcome"],
    reason?: string,
    requestId?: string,
    policyVersion?: number,
  ): void {
    const competition = this.requireCompetition();
    const policy = this.policy;
    if (!policy) throw new NotFoundError("competition policy was not found");
    this.auditSequence += 1;
    const event = createCompetitionAuditEvent({
      eventId: crypto.randomUUID(),
      competitionId: competition.config.id,
      sequence: this.auditSequence,
      occurredAt: new Date().toISOString(),
      principalId: principal.id,
      action,
      targetId,
      outcome,
      ...(reason === undefined ? {} : { reason }),
      ...(requestId === undefined ? {} : { requestId }),
      policyVersion: policyVersion ?? policy.version,
    });
    this.audit = appendCompetitionAudit(this.audit, event);
  }

  private snapshot(): CompetitionSnapshot {
    const competition = this.requireCompetition();
    const policy = this.policy;
    const engine = this.engine;
    if (!policy || !engine) throw new NotFoundError("competition state is incomplete");
    return Object.freeze({
      competition,
      policy,
      leaderboard: Object.freeze(buildCompetitionLeaderboard(engine.performance)),
      audit: this.audit,
    });
  }
}
