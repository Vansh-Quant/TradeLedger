import { describe, expect, it } from "vitest";
import { createAccount } from "../../core/domain/src/account.js";
import {
  createAccountingState,
  createLedgerEntry,
  depositToLedger,
  releaseReservation,
  reportRealizedPnl,
  reportUnrealizedPnl,
  reserveCash,
  withdrawFromLedger,
} from "../../core/domain/src/ledger.js";
import { createCashBalance } from "../../core/domain/src/cash.js";
import { createPortfolio } from "../../core/domain/src/portfolio.js";

const account = createAccount({ id: "ACC-LEDGER", baseCurrency: "USD" });
const timestamp = "2026-10-03T12:00:00.000Z";

function state() {
  return createAccountingState({
    account,
    cashBalance: createCashBalance("USD", 10_000),
    portfolio: createPortfolio(),
  });
}

describe("accounting ledger", () => {
  it("accepts signed realized and unrealized P&L", () => {
    let current = state();

    current = reportRealizedPnl(current, -250);
    expect(current.realizedPnl).toBe(-250);
    expect(current.cashBalance.amount).toBe(9_750);

    current = reportUnrealizedPnl(current, -500);
    expect(current.unrealizedPnl).toBe(-500);
    expect(current.totalEquity).toBe(9_250);
  });

  it("updates cash and equity through deposits and withdrawals", () => {
    let current = state();

    current = depositToLedger(current, {
      category: "deposit",
      amount: 1_000,
      description: "capital",
      txDate: timestamp,
    });
    expect(current.cashBalance.amount).toBe(11_000);
    expect(current.totalEquity).toBe(11_000);
    expect(current.ledger).toHaveLength(1);

    current = withdrawFromLedger(current, {
      category: "withdrawal",
      amount: 500,
      description: "withdrawal",
      txDate: timestamp,
    });
    expect(current.cashBalance.amount).toBe(10_500);
    expect(current.ledger).toHaveLength(2);
  });

  it("requires explicit valid transaction timestamps", () => {
    expect(() =>
      createLedgerEntry({
        ledgerId: "LED-1",
        accountId: account.id,
        txDate: "not-a-date",
        category: "deposit",
        debit: 0,
        credit: 100,
        status: "applied",
      }),
    ).toThrow("txDate must be a valid timestamp");
  });

  it("rejects entries containing both debit and credit", () => {
    expect(() =>
      createLedgerEntry({
        ledgerId: "LED-2",
        accountId: account.id,
        txDate: timestamp,
        category: "invalid",
        debit: 100,
        credit: 50,
        status: "applied",
      }),
    ).toThrow("ledger entry cannot contain both debit and credit");
  });

  it("enforces cash reservation limits and releases", () => {
    let current = state();

    current = reserveCash(current, 2_000);
    expect(current.reservedAmount).toBe(2_000);

    current = releaseReservation(current, 750);
    expect(current.reservedAmount).toBe(1_250);

    expect(() => reserveCash(current, 9_000)).toThrow(
      "reservation amount exceeds available cash",
    );
    expect(() => releaseReservation(current, 2_000)).toThrow(
      "release amount exceeds reserved amount",
    );
  });

  it("keeps accounting state immutable across transitions", () => {
    const original = state();
    const next = reportUnrealizedPnl(original, -100);

    expect(original.unrealizedPnl).toBe(0);
    expect(original.totalEquity).toBe(10_000);
    expect(next).not.toBe(original);
  });
});
