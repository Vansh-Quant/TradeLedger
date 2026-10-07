import { describe, expect, it } from "vitest";
import {
  createAccount,
  createAccountingState,
  createCashBalance,
  createPortfolio,
  settleExecution,
  createExecution,
  type InstrumentId,
} from "../../core/domain/src/index.js";

const account = createAccount({ id: "ACC-SETTLE", baseCurrency: "USD" });

function state() {
  return createAccountingState({
    account,
    cashBalance: createCashBalance("USD", 10_000),
    portfolio: createPortfolio(),
  });
}

describe("execution settlement", () => {
  it("settles a buy by reducing cash and opening a position", () => {
    const result = settleExecution(
      state(),
      createExecution({
        id: "EX-SETTLE-BUY",
        orderId: "ORD-1",
        instrumentId: "AAPL" as InstrumentId,
        side: "buy",
        quantity: 10,
        price: 100,
        executedAt: "2026-10-07T10:00:00Z",
        commission: 5,
      }),
    );

    expect(result.cashDelta).toBe(-1005);
    expect(result.state.cashBalance.amount).toBe(8_995);
    expect(result.portfolio.positions.get("AAPL")?.quantity).toBe(10);
    expect(result.state.ledger).toHaveLength(1);
    expect(result.state.ledger[0]?.debit).toBe(1005);
  });

  it("settles a sell with proceeds less commission", () => {
    const bought = settleExecution(
      state(),
      createExecution({
        id: "EX-SETTLE-OPEN",
        orderId: "ORD-1",
        instrumentId: "AAPL" as InstrumentId,
        side: "buy",
        quantity: 10,
        price: 100,
        executedAt: "2026-10-07T10:00:00Z",
        commission: 5,
      }),
    );

    const sold = settleExecution(
      bought.state,
      createExecution({
        id: "EX-SETTLE-CLOSE",
        orderId: "ORD-2",
        instrumentId: "AAPL" as InstrumentId,
        side: "sell",
        quantity: 10,
        price: 120,
        executedAt: "2026-10-07T11:00:00Z",
        commission: 5,
      }),
    );

    expect(sold.cashDelta).toBe(1195);
    expect(sold.state.cashBalance.amount).toBe(10_190);
    expect(sold.portfolio.positions.get("AAPL")).toBeUndefined();
    expect(sold.state.realizedPnl).toBe(190);
    expect(sold.realizedPnlDelta).toBe(190);
  });

  it("rejects duplicate settlement and negative cash", () => {
    const execution = createExecution({
      id: "EX-SETTLE-DUP",
      orderId: "ORD-1",
      instrumentId: "AAPL" as InstrumentId,
      side: "buy",
      quantity: 10,
      price: 100,
      executedAt: "2026-10-07T10:00:00Z",
      commission: 0,
    });

    const settled = settleExecution(state(), execution);
    expect(() => settleExecution(settled.state, execution)).toThrow(
      "execution has already been settled",
    );

    expect(() => settleExecution(
      createAccountingState({
        account,
        cashBalance: createCashBalance("USD", 50),
        portfolio: createPortfolio(),
      }),
      execution,
    )).toThrow("execution settlement would make cash negative");
  });

  it("keeps partial closes on the original average and realizes only the closed portion", () => {
    const opened = settleExecution(
      state(),
      createExecution({
        id: "EX-SETTLE-PARTIAL-OPEN",
        orderId: "ORD-1",
        instrumentId: "AAPL" as InstrumentId,
        side: "buy",
        quantity: 10,
        price: 100,
        executedAt: "2026-10-07T10:00:00Z",
        commission: 0,
      }),
    );

    const partial = settleExecution(
      opened.state,
      createExecution({
        id: "EX-SETTLE-PARTIAL-CLOSE",
        orderId: "ORD-2",
        instrumentId: "AAPL" as InstrumentId,
        side: "sell",
        quantity: 4,
        price: 125,
        executedAt: "2026-10-07T11:00:00Z",
        commission: 1,
      }),
    );

    expect(partial.portfolio.positions.get("AAPL")?.quantity).toBe(6);
    expect(partial.portfolio.positions.get("AAPL")?.averagePrice).toBe(100);
    expect(partial.state.realizedPnl).toBe(99);
    expect(partial.state.cashBalance.amount).toBe(9_499);
  });
});
