import { describe, expect, it } from "vitest";
import {
  calculateEquity,
  createCashBalance,
  depositCash,
  withdrawCash,
} from "../../core/domain/src/cash.js";

describe("CashBalance", () => {
  it("creates an immutable normalized balance", () => {
    const balance = createCashBalance(" usd ", 1_000);

    expect(balance.currency).toBe("USD");
    expect(balance.amount).toBe(1_000);
    expect(Object.isFrozen(balance)).toBe(true);
  });

  it("defaults to zero cash", () => {
    expect(createCashBalance("EUR").amount).toBe(0);
  });

  it("rejects invalid initial cash", () => {
    expect(() => createCashBalance("USD", -1)).toThrow(
      "amount must be non-negative",
    );
    expect(() => createCashBalance("USD", Number.NaN)).toThrow(
      "amount must be finite",
    );
    expect(() => createCashBalance("   ", 100)).toThrow(
      "currency must not be empty",
    );
  });

  it("deposits cash without mutating the original balance", () => {
    const balance = createCashBalance("USD", 1_000);
    const updated = depositCash(balance, 250);

    expect(balance.amount).toBe(1_000);
    expect(updated.amount).toBe(1_250);
  });

  it("withdraws only available cash", () => {
    const balance = createCashBalance("USD", 1_000);
    const updated = withdrawCash(balance, 400);

    expect(updated.amount).toBe(600);
    expect(() => withdrawCash(balance, 1_001)).toThrow(
      "withdrawal amount exceeds available cash",
    );
  });

  it("rejects non-positive cash movements", () => {
    const balance = createCashBalance("USD", 1_000);

    expect(() => depositCash(balance, 0)).toThrow("amount must be positive");
    expect(() => withdrawCash(balance, 0)).toThrow("amount must be positive");
  });

  it("calculates equity as cash plus unrealized P&L", () => {
    const balance = createCashBalance("USD", 10_000);

    expect(calculateEquity(balance, 750)).toBe(10_750);
    expect(calculateEquity(balance, -250)).toBe(9_750);
  });
});
