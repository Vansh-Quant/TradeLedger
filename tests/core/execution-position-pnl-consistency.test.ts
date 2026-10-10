import { describe, expect, it } from "vitest";
import {
  createAccount,
  createAccountingState,
  createCashBalance,
  createExecution,
  createPortfolio,
  settleExecution,
  type InstrumentId,
} from "../../core/domain/src/index.js";

const account = createAccount({ id: "ACC-PNL-CONSISTENCY", baseCurrency: "USD" });

function initialState(cash = 100_000) {
  return createAccountingState({
    account,
    cashBalance: createCashBalance("USD", cash),
    portfolio: createPortfolio(),
  });
}

function fill(input: {
  id: string;
  instrument?: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  commission?: number;
}) {
  return createExecution({
    id: input.id,
    orderId: "ORD-" + input.id,
    instrumentId: (input.instrument ?? "AAPL") as InstrumentId,
    side: input.side,
    quantity: input.quantity,
    price: input.price,
    executedAt: "2026-10-10T10:00:00Z",
    commission: input.commission ?? 0,
  });
}

describe("execution → position → P&L consistency", () => {
  it("keeps cash, ledger, position and net realized P&L aligned across a long-to-short reversal", () => {
    const opened = settleExecution(initialState(), fill({
      id: "EX-PNL-OPEN", side: "buy", quantity: 10, price: 100, commission: 2,
    }));
    const reversed = settleExecution(opened.state, fill({
      id: "EX-PNL-REVERSE", side: "sell", quantity: 15, price: 110, commission: 3,
    }));

    const position = reversed.portfolio.positions.get("AAPL");
    expect(position?.quantity).toBe(-5);
    expect(position?.side).toBe("short");
    expect(position?.averagePrice).toBe(110);
    expect(position?.realizedPnl).toBe(100);

    expect(reversed.cashDelta).toBe(1_647);
    expect(reversed.state.cashBalance.amount).toBe(100_645);
    expect(reversed.state.realizedPnl).toBe(95);
    expect(reversed.state.portfolio.realizedPnl).toBe(100);
    expect(reversed.state.totalEquity).toBe(
      reversed.state.cashBalance.amount + reversed.state.unrealizedPnl,
    );
    expect(reversed.state.ledger).toHaveLength(2);
    expect(reversed.state.ledger.reduce((sum, entry) => sum + entry.debit, 0)).toBe(1_002);
    expect(reversed.state.ledger.reduce((sum, entry) => sum + entry.credit, 0)).toBe(1_647);
    expect(reversed.state.ledger.map((entry) => entry.ledgerId)).toEqual([
      "EX-PNL-OPEN", "EX-PNL-REVERSE",
    ]);
  });

  it("keeps partial-close realized P&L separate from the remaining position's unrealized P&L", () => {
    const opened = settleExecution(initialState(), fill({
      id: "EX-PARTIAL-OPEN", side: "buy", quantity: 10, price: 100,
    }));
    const partial = settleExecution(opened.state, fill({
      id: "EX-PARTIAL-CLOSE", side: "sell", quantity: 4, price: 125, commission: 1,
    }));

    const position = partial.portfolio.positions.get("AAPL");
    expect(position?.quantity).toBe(6);
    expect(position?.averagePrice).toBe(100);
    expect(position?.realizedPnl).toBe(100);
    expect(partial.state.realizedPnl).toBe(99);
    expect(partial.state.cashBalance.amount).toBe(100_499);
    expect(partial.state.totalEquity).toBe(100_499);
    expect(partial.state.ledger).toHaveLength(2);
  });

  it("isolates instruments while aggregating cash and realized P&L at account level", () => {
    const aapl = settleExecution(initialState(), fill({
      id: "EX-MULTI-AAPL", instrument: "AAPL", side: "buy", quantity: 2, price: 100, commission: 1,
    }));
    const msft = settleExecution(aapl.state, fill({
      id: "EX-MULTI-MSFT", instrument: "MSFT", side: "sell", quantity: 3, price: 50, commission: 2,
    }));

    expect(msft.portfolio.positions.get("AAPL")?.quantity).toBe(2);
    expect(msft.portfolio.positions.get("MSFT")?.quantity).toBe(-3);
    expect(msft.state.cashBalance.amount).toBe(100_147);
    expect(msft.state.realizedPnl).toBe(-3);
    expect(msft.state.ledger).toHaveLength(2);
    expect(msft.state.ledger.every((entry) => entry.accountId === account.id)).toBe(true);
    expect(msft.state.totalEquity).toBe(msft.state.cashBalance.amount + msft.state.unrealizedPnl);
  });

  it("does not mutate the prior accounting snapshot when a later fill settles", () => {
    const initial = initialState();
    const first = settleExecution(initial, fill({
      id: "EX-IMMUTABLE-1", side: "buy", quantity: 5, price: 20,
    }));
    const second = settleExecution(first.state, fill({
      id: "EX-IMMUTABLE-2", side: "sell", quantity: 2, price: 25,
    }));

    expect(initial.cashBalance.amount).toBe(100_000);
    expect(initial.ledger).toHaveLength(0);
    expect(first.state.cashBalance.amount).toBe(99_900);
    expect(first.state.ledger).toHaveLength(1);
    expect(first.state.portfolio.positions.get("AAPL")?.quantity).toBe(5);
    expect(second.state.cashBalance.amount).toBe(99_950);
    expect(second.state.portfolio.positions.get("AAPL")?.quantity).toBe(3);
    expect(second.state.realizedPnl).toBe(10);
  });
});
