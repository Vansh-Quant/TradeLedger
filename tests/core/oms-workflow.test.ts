import { describe, expect, it } from "vitest";
import { createAccount } from "../../core/domain/src/account.js";
import { createAccountPortfolio } from "../../core/domain/src/account-portfolio.js";
import { createBuyingPower } from "../../core/domain/src/buying-power.js";
import { createExecution } from "../../core/domain/src/execution.js";
import { InMemoryExecutionEventStore } from "../../core/domain/src/execution-event-store.js";
import {
  admitOmsOrder,
  completeOmsCancellation,
  processOmsExecution,
  expireOmsOrder,
  requestOmsCancellation,
} from "../../core/domain/src/oms-workflow.js";
import { createOrder } from "../../core/domain/src/order.js";
import { createPortfolio } from "../../core/domain/src/portfolio.js";
import type { InstrumentId } from "../../core/domain/src/instrument.js";
import { createRiskLimits } from "../../core/domain/src/risk-boundary.js";

const account = createAccount({ id: "ACC-OMS", baseCurrency: "USD" });
const instrumentId = "AAPL" as InstrumentId;

function createBaseOrder(quantity = 10) {
  return createOrder({
    id: "ORD-OMS-1",
    accountId: account.id,
    instrumentId,
    side: "buy",
    type: "limit",
    quantity,
    limitPrice: 100,
    timeInForce: "day",
    createdAt: "2026-10-03T12:00:00.000Z",
  });
}

function admit(quantity = 10) {
  return admitOmsOrder({
    order: createBaseOrder(quantity),
    accountPortfolio: createAccountPortfolio(account, createPortfolio()),
    buyingPower: createBuyingPower(10_000),
    riskLimits: createRiskLimits({
      maxOrderNotional: 5_000,
      maxPositionNotional: 10_000,
      maxGrossExposure: 20_000,
      maxNetExposure: 15_000,
      maxDailyLoss: 1_000,
    }),
    orderNotional: quantity * 100,
    projectedPositionNotional: quantity * 100,
    projectedGrossExposure: quantity * 100,
    projectedNetExposure: quantity * 100,
    dailyLoss: 0,
  });
}

describe("OMS workflow", () => {
  it("admits through the canonical trading-core workflow", () => {
    const result = admit();

    expect(result.admitted).toBe(true);
    expect(result.state.order.status).toBe("acknowledged");
    expect(result.state.buyingPower.reservedCapacity).toBe(1_000);
    expect(result.state.reservation?.remainingAmount).toBe(1_000);
  });

  it("rejects without reserving buying power", () => {
    const result = admitOmsOrder({
      ...{
        order: createBaseOrder(10),
        accountPortfolio: createAccountPortfolio(account, createPortfolio()),
        buyingPower: createBuyingPower(10_000),
        riskLimits: createRiskLimits({
          maxOrderNotional: 500,
          maxPositionNotional: 10_000,
          maxGrossExposure: 20_000,
          maxNetExposure: 15_000,
          maxDailyLoss: 1_000,
        }),
        orderNotional: 1_000,
        projectedPositionNotional: 1_000,
        projectedGrossExposure: 1_000,
        projectedNetExposure: 1_000,
        dailyLoss: 0,
      },
    });

    expect(result.admitted).toBe(false);
    expect(result.state.order.status).toBe("rejected");
    expect(result.state.buyingPower.reservedCapacity).toBe(0);
  });

  it("applies a partial fill and releases only the proportional reservation", () => {
    const admitted = admit();
    const store = new InMemoryExecutionEventStore();

    const execution = createExecution({
      id: "EX-OMS-1",
      orderId: admitted.state.order.id,
      instrumentId,
      side: "buy",
      quantity: 4,
      price: 101,
      executedAt: "2026-10-03T12:01:00.000Z",
      commission: 0,
    });

    const result = processOmsExecution({
      state: admitted.state,
      execution,
      eventStore: store,
      eventId: "EV-OMS-1",
      recordedAt: "2026-10-03T12:01:01.000Z",
    });

    expect(result.applied).toBe(true);
    expect(result.duplicate).toBe(false);
    expect(result.state.order.status).toBe("partially_filled");
    expect(result.state.order.filledQuantity).toBe(4);
    expect(result.state.buyingPower.reservedCapacity).toBe(600);
    expect(result.state.reconciliation.accountPortfolio.portfolio.positions.get(instrumentId)?.quantity).toBe(4);
  });

  it("does not apply the same execution twice", () => {
    const admitted = admit();
    const store = new InMemoryExecutionEventStore();

    const execution = createExecution({
      id: "EX-OMS-DUP",
      orderId: admitted.state.order.id,
      instrumentId,
      side: "buy",
      quantity: 10,
      price: 100,
      executedAt: "2026-10-03T12:02:00.000Z",
      commission: 0,
    });

    const first = processOmsExecution({
      state: admitted.state,
      execution,
      eventStore: store,
      eventId: "EV-OMS-DUP-1",
      recordedAt: "2026-10-03T12:02:01.000Z",
    });

    const second = processOmsExecution({
      state: first.state,
      execution,
      eventStore: store,
      eventId: "EV-OMS-DUP-2",
      recordedAt: "2026-10-03T12:02:02.000Z",
    });

    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.state.order.filledQuantity).toBe(10);
    expect(second.state.buyingPower.reservedCapacity).toBe(0);
    expect(second.state.reconciliation.accountPortfolio.portfolio.positions.get(instrumentId)?.quantity).toBe(10);
  });

  it("expires an admitted order and releases its reservation", () => {
    const admitted = admit();
    const expired = expireOmsOrder(admitted.state);

    expect(expired.order.status).toBe("expired");
    expect(expired.reservation?.remainingAmount).toBe(0);
    expect(expired.buyingPower.reservedCapacity).toBe(0);
    expect(expired.reconciliation.order.status).toBe("expired");
  });

  it("allows a partially filled order to expire and releases only the remainder", () => {
    const admitted = admit();
    const store = new InMemoryExecutionEventStore();
    const execution = createExecution({
      id: "EX-OMS-EXPIRY",
      orderId: admitted.state.order.id,
      instrumentId,
      side: "buy",
      quantity: 4,
      price: 100,
      executedAt: "2026-10-03T12:01:00.000Z",
      commission: 0,
    });
    const partial = processOmsExecution({
      state: admitted.state,
      execution,
      eventStore: store,
      eventId: "EV-OMS-EXPIRY",
      recordedAt: "2026-10-03T12:01:01.000Z",
    });
    const expired = expireOmsOrder(partial.state);

    expect(expired.order.status).toBe("expired");
    expect(expired.order.filledQuantity).toBe(4);
    expect(expired.buyingPower.reservedCapacity).toBe(0);
    expect(expired.reservation?.remainingAmount).toBe(0);
    expect(expired.reconciliation.accountPortfolio.portfolio.positions.get(instrumentId)?.quantity).toBe(4);
  });

  it("rejects a partial fill for FOK orders", () => {
    const fokOrder = createOrder({
      id: "ORD-OMS-FOK", accountId: account.id, instrumentId,
      side: "buy", type: "limit", quantity: 10, limitPrice: 100,
      timeInForce: "fok", createdAt: "2026-10-03T12:00:00.000Z",
    });
    const admitted = admitOmsOrder({
      order: fokOrder,
      accountPortfolio: createAccountPortfolio(account, createPortfolio()),
      buyingPower: createBuyingPower(10_000),
      riskLimits: createRiskLimits({
        maxOrderNotional: 5_000, maxPositionNotional: 10_000,
        maxGrossExposure: 20_000, maxNetExposure: 15_000, maxDailyLoss: 1_000,
      }),
      orderNotional: 1_000, projectedPositionNotional: 1_000,
      projectedGrossExposure: 1_000, projectedNetExposure: 1_000, dailyLoss: 0,
    });
    const execution = createExecution({
      id: "EX-OMS-FOK", orderId: fokOrder.id, instrumentId,
      side: "buy", quantity: 4, price: 100,
      executedAt: "2026-10-03T12:01:00.000Z", commission: 0,
    });
    expect(() => processOmsExecution({
      state: admitted.state, execution,
      eventStore: new InMemoryExecutionEventStore(),
      eventId: "EV-OMS-FOK", recordedAt: "2026-10-03T12:01:01.000Z",
    })).toThrow("fok order requires a complete fill");
  });

  it("cancels and releases the remaining reservation", () => {
    const admitted = admit();
    const requested = requestOmsCancellation({ state: admitted.state });

    expect(requested.order.status).toBe("cancel_requested");
    expect(requested.state.reservation?.remainingAmount).toBe(1_000);
    expect(requested.state.buyingPower.reservedCapacity).toBe(1_000);

    const completed = completeOmsCancellation({ state: requested.state });

    expect(completed.order.status).toBe("cancelled");
    expect(completed.released).toBe(true);
    expect(completed.state.reservation?.remainingAmount).toBe(0);
    expect(completed.state.buyingPower.reservedCapacity).toBe(0);
  });

  it("preserves cancellation intent through a partial fill race and releases only the remainder on cancel", () => {
    const admitted = admit();
    const requested = requestOmsCancellation({ state: admitted.state });
    const execution = createExecution({
      id: "EX-OMS-CANCEL-RACE",
      orderId: requested.order.id,
      instrumentId,
      side: "buy",
      quantity: 4,
      price: 100,
      executedAt: "2026-10-03T12:03:00.000Z",
      commission: 0,
    });

    const partiallyFilled = processOmsExecution({
      state: requested.state,
      execution,
      eventStore: new InMemoryExecutionEventStore(),
      eventId: "EV-OMS-CANCEL-RACE",
      recordedAt: "2026-10-03T12:03:01.000Z",
    });

    expect(partiallyFilled.state.order.status).toBe("cancel_requested");
    expect(partiallyFilled.state.order.filledQuantity).toBe(4);
    expect(partiallyFilled.state.buyingPower.reservedCapacity).toBe(600);
    expect(partiallyFilled.state.reservation?.remainingAmount).toBe(600);

    const completed = completeOmsCancellation({
      state: partiallyFilled.state,
    });

    expect(completed.order.status).toBe("cancelled");
    expect(completed.released).toBe(true);
    expect(completed.state.buyingPower.reservedCapacity).toBe(0);
    expect(completed.state.reservation?.remainingAmount).toBe(0);
    expect(completed.state.reconciliation.accountPortfolio.portfolio.positions.get(instrumentId)?.quantity).toBe(4);
  });
});
