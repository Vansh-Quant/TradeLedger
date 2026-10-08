import {
  applyCompetitionControl,
  authorizeCompetitionCapability,
  authorizeCompetitionOrderWithState,
  buildCompetitionLeaderboard,
  createCompetition,
  openCompetitionRegistration,
  prepareCompetition,
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
  acceptIdempotentRequest,
  createIdempotencyState,
  type IdempotencyState,
} from "@tradeledger/domain";
import type { ApplicationPrincipal, CompetitionEvent, CompetitionPersistencePort } from "./contracts.js";
import { AuthorizationError, NotFoundError, ValidationError } from "./errors.js";
import type { TradingApplicationService } from "./trading-application-service.js";

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

export interface CompetitionOrderSubmissionCommand {
  readonly principal: ApplicationPrincipal;
  readonly participantId: string;
  readonly instrumentId: string;
  readonly side: "buy" | "sell";
  readonly type: "market" | "limit" | "stop" | "stop-limit";
  readonly quantity: number;
  readonly limitPrice?: number;
  readonly stopPrice?: number;
  readonly timeInForce: "day" | "gtc" | "ioc" | "fok";
  readonly second: number;
  readonly idempotencyKey?: string;
}

export interface CompetitionOrderSubmissionResult {
  readonly competitionDecision: ReturnType<CompetitionApplicationService["authorizeOrder"]>;
  readonly tradingResult: import("./trading-application-service.js").SubmitOrderResult;
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
  private eventSequence = 0;
  private events: CompetitionEvent[] = [];
  private readonly subscribers = new Set<(event: CompetitionEvent) => void>();
  private readonly persistence: CompetitionPersistencePort | undefined;
  private idempotency: IdempotencyState = createIdempotencyState();

  constructor(persistence?: CompetitionPersistencePort, private readonly trading?: TradingApplicationService) {
    this.persistence = persistence;
    const snapshot = persistence?.load();
    if (snapshot !== undefined) {
      this.competition = snapshot.competition;
      this.policy = snapshot.policy;
      this.engine = snapshot.engine;
      this.audit = snapshot.audit;
      this.events = [...snapshot.events];
      this.eventSequence = snapshot.eventSequence;
      this.auditSequence = snapshot.audit.reduce((max, event) => Math.max(max, event.sequence), 0);
      this.idempotency = snapshot.idempotency;
    }
  }

  subscribeToEvents(principal: ApplicationPrincipal, subscriber: (event: CompetitionEvent) => void): () => void {
    this.requireCapability(principal, "competition.view");
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  listEventsAfter(principal: ApplicationPrincipal, sequence: number): readonly CompetitionEvent[] {
    this.requireCapability(principal, "competition.view");
    if (!Number.isSafeInteger(sequence) || sequence < 0) throw new ValidationError("sequence must be a non-negative integer");
    return Object.freeze(this.events.filter((event) => event.sequence > sequence).slice());
  }

  create(command: CompetitionCreateCommand): CompetitionSnapshot {
    return this.exclusive(() => this.createUnsafe(command));
  }

  private createUnsafe(command: CompetitionCreateCommand): CompetitionSnapshot {
    this.requireCapability(command.principal, "competition.start");
    if (this.competition !== undefined) {
      throw new ValidationError("competition already exists");
    }
    const now = command.now ?? new Date().toISOString();
    this.competition = openCompetitionRegistration(createCompetition(command.config, now));
    this.policy = createCompetitionPolicy({
      tradingEnabled: true,
      emergencyHalt: false,
      allowedInstruments: command.config.allowedInstruments,
      maxOrderNotional: command.config.maxOrderNotional,
      maxOrdersPerParticipantPerSecond: command.config.maxOrdersPerParticipantPerSecond,
    });
    this.engine = createCompetitionEngineState(this.competition);
    this.appendAudit(command.principal, "competition_state_change", command.config.id, "applied", "created", undefined);
    this.emit("competition.created", command.config.id, {}, undefined);
    return this.snapshot();
  }

  get(principal: ApplicationPrincipal): CompetitionSnapshot {
    this.requireCapability(principal, "competition.view");
    if (!this.competition || !this.policy || !this.engine) throw new NotFoundError("competition was not found");
    return this.snapshot();
  }

  register(command: CompetitionRegistrationCommand): CompetitionSnapshot {
    return this.exclusive(() => this.registerUnsafe(command));
  }

  private registerUnsafe(command: CompetitionRegistrationCommand): CompetitionSnapshot {
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
    this.idempotency = idem.state;
    this.replaceCompetition(result.competition);
    this.rebuildEngine();
    this.appendAudit(command.principal, "participant_state_change", participant.participantId, "applied", "registered", undefined);
    this.emit("participant.registered", participant.participantId, { accountId: participant.accountId }, undefined);
    return this.snapshot();
  }

  prepare(principal: ApplicationPrincipal, requestId: string): CompetitionControlResult {
    return this.exclusive(() => this.prepareUnsafe(principal, requestId));
  }

  private prepareUnsafe(principal: ApplicationPrincipal, requestId: string): CompetitionControlResult {
    this.requireCapability(principal, "competition.start");
    const competition = this.requireCompetition();
    const request = requireString(requestId, "requestId");
    const fingerprint = JSON.stringify({ action: "prepare", principalId: principal.id });
    const idem = acceptIdempotentRequest(this.idempotency, request, fingerprint, competition.sequence, true);
    if (idem.duplicate) return Object.freeze({ applied: false, reason: "duplicate_request", competition });
    this.idempotency = idem.state;
    const prepared = prepareCompetition(competition);
    this.replaceCompetition(prepared);
    this.rebuildEngine();
    this.appendAudit(principal, "competition_state_change", competition.config.id, "applied", "prepared", request);
    this.emit("competition.prepared", competition.config.id, {}, request);
    return Object.freeze({ applied: true, reason: "allowed", competition: prepared });
  }

  control(command: CompetitionControlCommand, prepareOnly = false): CompetitionControlResult {
    return this.exclusive(() => this.controlUnsafe(command));
  }

  private controlUnsafe(command: CompetitionControlCommand, prepareOnly = false): CompetitionControlResult {
    const competition = this.requireCompetition();
    const principal = principalForCompetition(command.principal);
    const capability = this.capabilityForAction(command.action);
    this.requireCapability(command.principal, capability);
    if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 0) {
      throw new ValidationError("expectedVersion must be a non-negative integer");
    }
    const requestId = requireString(command.requestId, "requestId");
    const fingerprint = JSON.stringify({ action: command.action, expectedVersion: command.expectedVersion, participantId: command.participantId ?? null, principalId: command.principal.id });
    const idem = acceptIdempotentRequest(this.idempotency, requestId, fingerprint, competition.sequence, true);
    if (idem.duplicate) return Object.freeze({ applied: false, reason: "duplicate_request", competition });

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
      this.idempotency = idem.state;
      this.appendAudit(command.principal, "control", competition.config.id, "denied", result.reason, requestId);
      return Object.freeze(result);
    }

    this.replaceCompetition(result.competition);
    this.rebuildEngine();
    this.appendAudit(command.principal, "competition_state_change", competition.config.id, "applied", command.action, requestId);
    const eventType = ({ start: "competition.started", pause: "competition.paused", resume: "competition.resumed", complete: "competition.completed", halt: "competition.halted", suspend_participant: "participant.suspended", resume_participant: "participant.resumed", liquidate_participant: "participant.liquidation.requested" } as const)[command.action];
    this.emit(eventType, command.participantId ?? competition.config.id, {}, requestId);
    return Object.freeze(result);
  }

  updatePolicy(command: CompetitionPolicyUpdateCommand): CompetitionSnapshot {
    return this.exclusive(() => this.updatePolicyUnsafe(command));
  }

  private updatePolicyUnsafe(command: CompetitionPolicyUpdateCommand): CompetitionSnapshot {
    this.requireCapability(command.principal, "policy.update");
    const current = this.policy;
    if (!current) throw new NotFoundError("competition was not found");
    this.policy = updateCompetitionPolicy(current, command.patch);
    this.appendAudit(command.principal, "policy_change", this.requireCompetition().config.id, "applied", "policy updated", undefined);
    this.emit("competition.policy.updated", this.requireCompetition().config.id, { policyVersion: this.policy.version, tradingEnabled: this.policy.tradingEnabled, emergencyHalt: this.policy.emergencyHalt }, undefined);
    return this.snapshot();
  }

  authorizeOrder(command: CompetitionOrderAuthorizationCommand) {
    return this.exclusive(() => this.authorizeOrderUnsafe(command));
  }

  private authorizeOrderUnsafe(command: CompetitionOrderAuthorizationCommand) {
    this.requireCapability(command.principal, "competition.view");
    const engine = this.engine;
    if (!engine) throw new NotFoundError("competition was not found");
    const participantId = requireString(command.participantId, "participantId");
    const instrumentId = requireString(command.instrumentId, "instrumentId");
    const orderNotional = requireFinite(command.orderNotional, "orderNotional");
    if (!Number.isSafeInteger(command.second) || command.second < 0) {
      throw new ValidationError("second must be a non-negative integer");
    }

    const policy = this.policy;
    if (!policy) throw new NotFoundError("competition policy was not found");
    const result = authorizeCompetitionOrderWithState(engine, {
      participantId,
      instrumentId,
      orderNotional,
      second: command.second,
    }, policy);
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
    this.emit(result.decision.allowed ? "competition.order.authorized" : "competition.order.rejected", participantId, { instrumentId, orderNotional, allowed: result.decision.allowed }, undefined);
    return Object.freeze(result);
  }

  submitParticipantOrder(command: CompetitionOrderSubmissionCommand): CompetitionOrderSubmissionResult {
    return this.exclusive(() => this.submitParticipantOrderUnsafe(command));
  }

  private submitParticipantOrderUnsafe(command: CompetitionOrderSubmissionCommand): CompetitionOrderSubmissionResult {
    if (!this.trading) throw new ValidationError("competition trading adapter is not configured");
    const snapshot = this.requireCompetition();
    const participant = snapshot.participants.find((entry) => entry.participantId === requireString(command.participantId, "participantId"));
    if (!participant) throw new NotFoundError("participant was not found");
    if (participant.state !== "active") throw new AuthorizationError("participant_not_active");
    const price = command.limitPrice ?? command.stopPrice;
    if (price === undefined || !Number.isFinite(price) || price <= 0) {
      throw new ValidationError("competition orders require an authoritative limit or stop price until market pricing is available");
    }
    const decision = this.authorizeOrderUnsafe({
      principal: command.principal,
      participantId: participant.participantId,
      instrumentId: command.instrumentId,
      orderNotional: command.quantity * price,
      second: command.second,
    });
    if (!decision.decision.allowed) {
      throw new AuthorizationError(decision.decision.reason);
    }
    const tradingResult = this.trading.submitOrderFromIntent({
      principal: command.principal,
      accountId: participant.accountId,
      instrumentId: command.instrumentId,
      side: command.side,
      type: command.type,
      quantity: command.quantity,
      ...(command.limitPrice === undefined ? {} : { limitPrice: command.limitPrice }),
      ...(command.stopPrice === undefined ? {} : { stopPrice: command.stopPrice }),
      timeInForce: command.timeInForce,
      idempotencyKey: command.idempotencyKey,
    });
    return Object.freeze({ competitionDecision: decision, tradingResult });
  }

  updatePerformance(command: CompetitionPerformanceUpdateCommand): CompetitionSnapshot {
    return this.exclusive(() => this.updatePerformanceUnsafe(command));
  }

  private updatePerformanceUnsafe(command: CompetitionPerformanceUpdateCommand): CompetitionSnapshot {
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
    this.emit("competition.performance.updated", participantId, { realizedPnl: command.realizedPnl, unrealizedPnl: command.unrealizedPnl }, undefined);
    return this.snapshot();
  }

  private emit(type: CompetitionEvent["type"], targetId: string, payload: Readonly<Record<string, string | number | boolean>>, requestId?: string): void {
    const competition = this.requireCompetition();
    const event: CompetitionEvent = Object.freeze({ eventId: crypto.randomUUID(), type, occurredAt: new Date().toISOString(), competitionId: competition.config.id, sequence: this.eventSequence + 1, targetId, ...(requestId === undefined ? {} : { requestId }), payload: Object.freeze({ ...payload }) });
    this.eventSequence = event.sequence;
    this.events.push(event);
    this.persist();
    for (const subscriber of [...this.subscribers]) { try { subscriber(event); } catch { /* transport consumers cannot roll back durable state */ } }
  }

  private persist(): void {
    if (!this.persistence) return;
    this.persistence.save({ competition: this.requireCompetition(), policy: this.policy!, engine: this.engine!, audit: this.audit, eventSequence: this.eventSequence, events: Object.freeze(this.events.slice()) });
  }

  private exclusive<T>(operation: () => T): T {
    if (this.persistence?.withExclusive === undefined) return operation();
    return this.persistence.withExclusive(() => {
      const snapshot = this.persistence?.load();
      if (snapshot !== undefined) {
        this.competition = snapshot.competition;
        this.policy = snapshot.policy;
        this.engine = snapshot.engine;
        this.audit = snapshot.audit;
        this.events = [...snapshot.events];
        this.eventSequence = snapshot.eventSequence;
        this.auditSequence = snapshot.audit.reduce((max, event) => Math.max(max, event.sequence), 0);
        this.idempotency = snapshot.idempotency;
      }
      return operation();
    });
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
