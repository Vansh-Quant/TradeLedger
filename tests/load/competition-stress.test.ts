import { describe, expect, it } from "vitest";
import { performance } from "node:perf_hooks";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { CompetitionApplicationService, type ApplicationPrincipal } from "@tradeledger/application";
import { authorizeCompetitionOrderWithState, createCompetition, createCompetitionEngineState, createCompetitionPolicy, openCompetitionRegistration, prepareCompetition, registerCompetitionParticipant, startCompetition } from "@tradeledger/domain";
import { DurableCompetitionPersistence } from "../../core/infrastructure/src/index.js";

const owner: ApplicationPrincipal = { id: "stress-owner", roles: ["owner"] };
const participantId = (index: number) => "P-" + String(index).padStart(4, "0");

function buildLiveCompetition() {
  let competition = openCompetitionRegistration(createCompetition({
    id: "CMP-STRESS", name: "Stress Competition", maxParticipants: 1000,
    allowedInstruments: ["AAPL", "MSFT", "NVDA"], maxOrderNotional: 50_000,
    maxOrdersPerParticipantPerSecond: 10, startingEquity: 100_000,
  }, "2026-10-08T12:00:00Z"));
  for (let i = 0; i < 1000; i += 1) competition = registerCompetitionParticipant(competition, {
    participantId: participantId(i), accountId: "ACC-" + participantId(i), state: "registered", registeredAt: "2026-10-08T12:00:00Z",
  });
  return startCompetition(prepareCompetition(competition));
}

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

describe("competition full stress profile", () => {
  it("sustains 10,000+ authority decisions per simulated second with 1,000 participants", { timeout: 60_000 }, () => {
    const competition = buildLiveCompetition(); let engine = createCompetitionEngineState(competition);
    let accepted = 0; const latencies: number[] = []; const started = performance.now();
    for (let second = 0; second < 2; second += 1) for (let participant = 0; participant < 1000; participant += 1) for (let order = 0; order < 10; order += 1) {
      const t0 = performance.now();
      const result = authorizeCompetitionOrderWithState(engine, { participantId: participantId(participant), instrumentId: participant % 3 === 0 ? "AAPL" : participant % 3 === 1 ? "MSFT" : "NVDA", orderNotional: 1000, second });
      latencies.push(performance.now() - t0); engine = result.state; if (result.decision.allowed) accepted += 1;
    }
    const elapsedSeconds = (performance.now() - started) / 1000; const throughput = accepted / elapsedSeconds;
    expect(accepted).toBe(20_000); expect(engine.orderCounts[participantId(0)]).toBe(20); expect(Object.keys(engine.orderCounts)).toHaveLength(1000);
    expect(throughput).toBeGreaterThan(100); expect(percentile(latencies, .50)).toBeGreaterThanOrEqual(0); expect(percentile(latencies, .95)).toBeGreaterThanOrEqual(0); expect(percentile(latencies, .99)).toBeGreaterThanOrEqual(0);
    console.info("[competition-stress] authority", JSON.stringify({ accepted, throughputPerSecond: Number(throughput.toFixed(2)), p50Ms: Number(percentile(latencies,.50).toFixed(4)), p95Ms: Number(percentile(latencies,.95).toFixed(4)), p99Ms: Number(percentile(latencies,.99).toFixed(4)), elapsedSeconds: Number(elapsedSeconds.toFixed(3)) }));
  });

  it("blocks every decision during an emergency halt without mutating engine state", { timeout: 30_000 }, () => {
    const competition = buildLiveCompetition(); let engine = createCompetitionEngineState(competition);
    const policy = createCompetitionPolicy({ tradingEnabled: true, emergencyHalt: true, allowedInstruments: competition.config.allowedInstruments, maxOrderNotional: competition.config.maxOrderNotional, maxOrdersPerParticipantPerSecond: competition.config.maxOrdersPerParticipantPerSecond });
    let rejected = 0;
    for (let index = 0; index < 20_000; index += 1) {
      const result = authorizeCompetitionOrderWithState(engine, { participantId: participantId(index % 1000), instrumentId: "AAPL", orderNotional: 1000, second: Math.floor(index / 10_000) }, policy);
      engine = result.state; if (!result.decision.allowed && result.decision.reason === "emergency_halt") rejected += 1;
    }
    expect(rejected).toBe(20_000); expect(engine.orderCounts).toEqual({}); expect(engine.second).toBe(0);
  });

  it("fans out realtime updates to 1,000 subscribers without dropping events", { timeout: 30_000 }, () => {
    const service = new CompetitionApplicationService();
    service.create({ principal: owner, config: { id: "CMP-FANOUT-STRESS", name: "Fanout Stress", maxParticipants: 1000, allowedInstruments: ["AAPL"], maxOrderNotional: 50_000, maxOrdersPerParticipantPerSecond: 10, startingEquity: 100_000 } });
    const received = new Uint32Array(1000);
    const unsubscribers = Array.from({ length: 1000 }, (_, index) => service.subscribeToEvents(owner, () => { received[index] += 1; }));
    const started = performance.now(); for (let index = 0; index < 100; index += 1) service.updatePolicy({ principal: owner, patch: { maxOrderNotional: 40_000 + index } });
    const elapsedSeconds = (performance.now() - started) / 1000; for (const unsubscribe of unsubscribers) unsubscribe();
    expect(Array.from(received).every((count) => count === 100)).toBe(true); expect(service.listEventsAfter(owner, 0)).toHaveLength(101); expect(elapsedSeconds).toBeLessThan(10);
    console.info("[competition-stress] fanout", JSON.stringify({ subscribers: 1000, events: 100, deliveries: 100000, elapsedSeconds: Number(elapsedSeconds.toFixed(3)) }));
  });

  it("keeps participant isolation and leaderboard correctness through 1,000 performance updates", { timeout: 60_000 }, () => {
    const service = new CompetitionApplicationService(); service.create({ principal: owner, config: { id: "CMP-PERF-STRESS", name: "Performance Stress", maxParticipants: 1000, allowedInstruments: ["AAPL"], maxOrderNotional: 50_000, maxOrdersPerParticipantPerSecond: 10, startingEquity: 100_000 } });
    for (let index = 0; index < 1000; index += 1) service.register({ principal: owner, participantId: participantId(index), accountId: "ACC-" + participantId(index) });
    const prepared = service.prepare(owner, "prepare-performance-stress"); service.control({ principal: owner, action: "start", expectedVersion: prepared.competition.version, requestId: "start-performance-stress" });
    const started = performance.now(); for (let index = 0; index < 1000; index += 1) service.updatePerformance({ principal: owner, participantId: participantId(index), realizedPnl: index, unrealizedPnl: index / 2 });
    const elapsedSeconds = (performance.now() - started) / 1000; const snapshot = service.get(owner);
    expect(snapshot.competition.participants).toHaveLength(1000); expect(snapshot.competition.participants.every((p) => p.accountId.startsWith("ACC-P-"))).toBe(true);
    expect(snapshot.leaderboard).toHaveLength(1000); expect(snapshot.leaderboard[0]?.participantId).toBe("P-0999"); expect(snapshot.leaderboard[999]?.participantId).toBe("P-0000"); expect(snapshot.audit).toHaveLength(1003); expect(elapsedSeconds).toBeLessThan(60);
    console.info("[competition-stress] leaderboard", JSON.stringify({ participants: 1000, performanceUpdates: 1000, elapsedSeconds: Number(elapsedSeconds.toFixed(3)) }));
  });

  it("survives segmented persistence restart after a burst of state changes", { timeout: 60_000 }, () => {
    const root = mkdtempSync(join(process.cwd(), ".tmp-competition-stress-"));
    try {
      const persistence = new DurableCompetitionPersistence(root, 2048); const service = new CompetitionApplicationService(persistence);
      service.create({ principal: owner, config: { id: "CMP-RECOVERY-STRESS", name: "Recovery Stress", maxParticipants: 1000, allowedInstruments: ["AAPL"], maxOrderNotional: 50_000, maxOrdersPerParticipantPerSecond: 10, startingEquity: 100_000 } });
      for (let index = 0; index < 200; index += 1) service.updatePolicy({ principal: owner, patch: { maxOrderNotional: 25_000 + index } });
      const before = service.get(owner); const logBefore = persistence.eventLogStatus();
      expect(logBefore.events.latestSequence).toBe(201); expect(logBefore.events.segmentCount).toBeGreaterThan(1);
      const recovered = new CompetitionApplicationService(persistence); const after = recovered.get(owner);
      expect(after.competition.version).toBe(before.competition.version); expect(after.policy.version).toBe(before.policy.version); expect(after.audit).toHaveLength(before.audit.length); expect(recovered.listEventsAfter(owner, 0)).toHaveLength(201);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});