/**
 * Base-currency cash state for an Account.
 *
 * Cash is modeled independently from Account identity and Portfolio positions.
 * The initial foundation supports one account base currency. Multi-currency
 * balances, financing, settlement, and broker cash reconciliation are future
 * concerns.
 */

interface CashBalance {
  readonly currency: string;
  readonly amount: number;
}

function requireNonEmpty(value: string, field: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new Error(`${field} must not be empty`);
  }

  return normalized;
}

function requireFinite(value: number, field: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${field} must be finite`);
  }

  return value;
}

function requireNonNegative(value: number, field: string): number {
  requireFinite(value, field);

  if (value < 0) {
    throw new Error(`${field} must be non-negative`);
  }

  return value;
}

function normalizeCurrency(value: string): string {
  return requireNonEmpty(value, "currency").toUpperCase();
}

/**
 * Creates an immutable cash balance.
 *
 * Negative cash is rejected at this foundation layer. Borrowing, margin,
 * credit facilities, and financing costs will require an explicit later model
 * rather than silently turning a cash balance into a debt account.
 */
export function createCashBalance(currency: string, amount = 0): CashBalance {
  const balance: CashBalance = {
    currency: normalizeCurrency(currency),
    amount: requireNonNegative(amount, "amount"),
  };

  return Object.freeze(balance);
}

export function depositCash(balance: CashBalance, amount: number): CashBalance {
  const deposit = requireFinite(amount, "amount");

  if (deposit <= 0) {
    throw new Error("amount must be positive");
  }

  return Object.freeze({ ...balance, amount: balance.amount + deposit });
}

export function withdrawCash(balance: CashBalance, amount: number): CashBalance {
  const withdrawal = requireFinite(amount, "amount");

  if (withdrawal <= 0) {
    throw new Error("amount must be positive");
  }

  if (withdrawal > balance.amount) {
    throw new Error("withdrawal amount exceeds available cash");
  }

  return Object.freeze({ ...balance, amount: balance.amount - withdrawal });
}

/**
 * Calculates account equity from settled cash plus current unrealized P&L.
 * Realized P&L is intentionally not added separately because realized P&L is
 * assumed to already be reflected in the cash balance by the accounting flow.
 */
export function calculateEquity(balance: CashBalance, unrealizedPnl: number): number {
  return balance.amount + requireFinite(unrealizedPnl, "unrealizedPnl");
}
