import { describe, expect, it } from "vitest";
import {
  CompetitionApplicationService,
  TradingApplicationService,
  AllowListedAuthorization,
  InMemoryOrderStateStore,
  InMemoryTradingContext,
  fixedClock,
  fixedOrderIdGenerator,
} from "@tradeledger/application";
import {
  createAccount,
  createAccountPortfolio,
  createBuyingPower,
  createPortfolio,
  createRiskLimits,
} from "@tradeledger/domain";

const principal = { id: "competition-trader", roles: ["owner", "trader"] };

describe("competition order gateway", () => {
  it("enforces competition authority before OMS admission", () => {
    const account = createAccount({ id: "CMP-0001", baseCurrency: "USD" });
    const trading = new TradingApplicationService(
      new InMemoryTradingContext([{
        accountId: account.id,
        accountPortfolio: createAccountPortfolio(account, createPortfolio()),
        buyingPower: createBuyingPower(100_000),
        riskLimits: createRiskLimits({
          maxOrderNotional: 50_000,
          maxPositionNotional: 100_000,
          maxGrossExposure: 200_000,
          maxNetExposure: 150_000,
          maxDailyLoss: 5_000,
        }),
      }]),
      new InMemoryOrderStateStore(),
      new AllowListedAuthorization(["competition-trader:order.submit:CMP-0001"]),
      fixedOrderIdGenerator("ORD-COMP-0001"),
      fixedClock("2026-10-08T12:00:00Z"),
    );

    const competition = new CompetitionApplicationService(undefined, trading);
    competition.create({
      principal,
      config: {
        id: "CMP-GATE",
        name: "Gateway",
        maxParticipants: 1000,
        allowedInstruments: ["AAPL"],
        maxOrderNotional: 50_000,
        maxOrdersPerParticipantPerSecond: 10,
        startingEquity: 100_000,
      },
    });
    competition.register({ principal, participantId: "P-0001", accountId: "CMP-0001" });
    const prepared = competition.prepare(principal, "prepare-gate");
    competition.control({
      principal,
      action: "start",
      expectedVersion: prepared.competition.version,
      requestId: "start-gate",
    });

    const result = competition.submitParticipantOrder({
      principal,
      participantId: "P-0001",
      instrumentId: "AAPL",
      side: "buy",
      type: "limit",
      quantity: 10,
      limitPrice: 100,
      timeInForce: "day",
      second: 1,
      idempotencyKey: "competition-order-1",
    });

    expect(result.competitionDecision.decision.allowed).toBe(true);
    expect(result.tradingResult.admitted).toBe(true);

    const blocked = competition.updatePolicy({ principal, patch: { emergencyHalt: true } });
    expect(blocked.policy.emergencyHalt).toBe(true);

    expect(() => competition.submitParticipantOrder({
      principal,
      participantId: "P-0001",
      instrumentId: "AAPL",
      side: "buy",
      type: "limit",
      quantity: 1,
      limitPrice: 100,
      timeInForce: "day",
      second: 2,
      idempotencyKey: "competition-order-2",
    })).toThrow(/emergency_halt/);
  });
});
