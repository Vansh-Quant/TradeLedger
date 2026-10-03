import type { Account } from "./account.js";
import type { Portfolio } from "./portfolio.js";

export type LedgerStatus = "pending" | "applied" | "reversed";

export interface LedgerTx {
  readonly ledgerId: string;
  readonly accountId: string;
  readonly txDate: string;
  readonly description?: string;
  readonly status: LedgerStatus;
}

export interface LedgerEntry {
  readonly ledgerId: string;
  readonly accountId: string;
  readonly txDate: string;
  readonly description?: string;
  readonly category: string;
  readonly debit: number;
  readonly credit: number;
  readonly status: LedgerStatus;
}

export interface BookedEntry {
  readonly ledgerId: string;
  readonly accountId: string;
  readonly txDate: string;
  readonly description?: string;
  readonly category: string;
  readonly amount: number;
  readonly currency: string;
  readonly status: LedgerStatus;
}

export interface AccountingState {
  readonly account: Account;
  readonly cashBalance: Readonly<{ currency: string; amount: number }>;
  readonly portfolio: Portfolio;
  readonly ledger: readonly LedgerEntry[];
  readonly booked: readonly BookedEntry[];
  readonly realizedPnl: number;
  readonly unrealizedPnl: number;
  readonly totalEquity: number;
  readonly reservedAmount: number;
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

function requirePositive(value: number, field: string): number {
  requireFinite(value, field);
  if (value <= 0) {
    throw new Error(`${field} must be positive`);
  }
  return value;
}

function requireNonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`${field} must not be empty`);
  }
  return normalized;
}

function requireCurrency(value: string): string {
  const normalized = requireNonEmpty(value, "currency").toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error("currency must be a three-letter ISO code");
  }
  return normalized;
}

function requireTimestamp(value: string, field = "txDate"): string {
  const normalized = requireNonEmpty(value, field);
  if (!Number.isFinite(Date.parse(normalized))) {
    throw new Error(`${field} must be a valid timestamp`);
  }
  return normalized;
}

function assertStatus(status: LedgerStatus): void {
  if (status !== "pending" && status !== "applied" && status !== "reversed") {
    throw new Error("status must be pending, applied, or reversed");
  }
}

function createLedgerId(): string {
  return crypto.randomUUID();
}

export function createCashBalance(
  currency: string,
  amount = 0,
): Readonly<{ currency: string; amount: number }> {
  return Object.freeze({
    currency: requireCurrency(currency),
    amount: requireNonNegative(amount, "amount"),
  });
}

export function depositCash(
  balance: Readonly<{ currency: string; amount: number }>,
  amount: number,
): Readonly<{ currency: string; amount: number }> {
  const deposit = requirePositive(amount, "amount");
  return Object.freeze({ ...balance, amount: balance.amount + deposit });
}

export function withdrawCash(
  balance: Readonly<{ currency: string; amount: number }>,
  amount: number,
): Readonly<{ currency: string; amount: number }> {
  const withdrawal = requirePositive(amount, "amount");
  if (withdrawal > balance.amount) {
    throw new Error("withdrawal amount exceeds available cash");
  }
  return Object.freeze({ ...balance, amount: balance.amount - withdrawal });
}

export function calculateEquity(
  balance: Readonly<{ currency: string; amount: number }>,
  unrealizedPnl: number,
): number {
  return balance.amount + requireFinite(unrealizedPnl, "unrealizedPnl");
}

export function createLedgerEntry(input: {
  readonly ledgerId: string;
  readonly accountId: string;
  readonly txDate: string;
  readonly description?: string;
  readonly category: string;
  readonly debit: number;
  readonly credit: number;
  readonly status: LedgerStatus;
}): LedgerEntry {
  const ledgerId = requireNonEmpty(input.ledgerId, "ledgerId");
  const accountId = requireNonEmpty(input.accountId, "accountId");
  const txDate = requireTimestamp(input.txDate);
  const description =
    input.description === undefined ? undefined : input.description.trim();
  const category = requireNonEmpty(input.category, "category");
  const debit = requireNonNegative(input.debit, "debit");
  const credit = requireNonNegative(input.credit, "credit");
  assertStatus(input.status);

  if (debit === 0 && credit === 0) {
    throw new Error("debit + credit must be greater than zero");
  }

  if (debit > 0 && credit > 0) {
    throw new Error("ledger entry cannot contain both debit and credit");
  }

  return Object.freeze({
    ledgerId,
    accountId,
    txDate,
    description,
    category,
    debit,
    credit,
    status: input.status,
  });
}

export function createBookedEntry(input: {
  readonly ledgerId: string;
  readonly accountId: string;
  readonly txDate: string;
  readonly description?: string;
  readonly category: string;
  readonly amount: number;
  readonly currency: string;
  readonly status: LedgerStatus;
}): BookedEntry {
  const entry = {
    ledgerId: requireNonEmpty(input.ledgerId, "ledgerId"),
    accountId: requireNonEmpty(input.accountId, "accountId"),
    txDate: requireTimestamp(input.txDate),
    description:
      input.description === undefined ? undefined : input.description.trim(),
    category: requireNonEmpty(input.category, "category"),
    amount: requireNonNegative(input.amount, "amount"),
    currency: requireCurrency(input.currency),
    status: input.status,
  };

  assertStatus(entry.status);
  return Object.freeze(entry);
}

export function createAccountingState(input: {
  readonly account: Account;
  readonly cashBalance: Readonly<{ currency: string; amount: number }>;
  readonly portfolio: Portfolio;
  readonly ledger?: readonly LedgerEntry[];
  readonly booked?: readonly BookedEntry[];
  readonly realizedPnl?: number;
  readonly unrealizedPnl?: number;
  readonly totalEquity?: number;
  readonly reservedAmount?: number;
}): AccountingState {
  const realizedPnl = requireFinite(input.realizedPnl ?? 0, "realizedPnl");
  const unrealizedPnl = requireFinite(
    input.unrealizedPnl ?? input.portfolio.unrealizedPnl,
    "unrealizedPnl",
  );
  const totalEquity =
    input.totalEquity ??
    calculateEquity(input.cashBalance, unrealizedPnl);
  const reservedAmount = requireNonNegative(
    input.reservedAmount ?? 0,
    "reservedAmount",
  );

  return Object.freeze({
    account: input.account,
    cashBalance: Object.freeze({ ...input.cashBalance }),
    portfolio: input.portfolio,
    ledger: Object.freeze([...(input.ledger ?? [])]),
    booked: Object.freeze([...(input.booked ?? [])]),
    realizedPnl,
    unrealizedPnl,
    totalEquity: requireFinite(totalEquity, "totalEquity"),
    reservedAmount,
  });
}

function withState(
  state: AccountingState,
  changes: Partial<AccountingState>,
): AccountingState {
  return Object.freeze({ ...state, ...changes });
}

export function depositToLedger(
  state: AccountingState,
  input: {
    readonly category: string;
    readonly amount: number;
    readonly description?: string;
    readonly txDate: string;
  },
): AccountingState {
  const ledgerId = createLedgerId();
  const entry = createLedgerEntry({
    ledgerId,
    accountId: state.account.id,
    txDate: input.txDate,
    description: input.description,
    category: input.category,
    debit: 0,
    credit: input.amount,
    status: "applied",
  });
  const cashBalance = depositCash(state.cashBalance, input.amount);

  return withState(state, {
    ledger: Object.freeze([...state.ledger, entry]),
    cashBalance,
    totalEquity: calculateEquity(cashBalance, state.unrealizedPnl),
  });
}

export function withdrawFromLedger(
  state: AccountingState,
  input: {
    readonly category: string;
    readonly amount: number;
    readonly description?: string;
    readonly txDate: string;
  },
): AccountingState {
  const ledgerId = createLedgerId();
  const entry = createLedgerEntry({
    ledgerId,
    accountId: state.account.id,
    txDate: input.txDate,
    description: input.description,
    category: input.category,
    debit: input.amount,
    credit: 0,
    status: "applied",
  });
  const cashBalance = withdrawCash(state.cashBalance, input.amount);

  return withState(state, {
    ledger: Object.freeze([...state.ledger, entry]),
    cashBalance,
    totalEquity: calculateEquity(cashBalance, state.unrealizedPnl),
  });
}

export function reserveCash(
  state: AccountingState,
  amount: number,
): AccountingState {
  const reservation = requirePositive(amount, "amount");
  const availableCash = state.cashBalance.amount - state.reservedAmount;
  if (reservation > availableCash) {
    throw new Error("reservation amount exceeds available cash");
  }

  return withState(state, {
    reservedAmount: state.reservedAmount + reservation,
  });
}

export function releaseReservation(
  state: AccountingState,
  amount: number,
): AccountingState {
  const release = requirePositive(amount, "amount");
  if (release > state.reservedAmount) {
    throw new Error("release amount exceeds reserved amount");
  }

  return withState(state, {
    reservedAmount: state.reservedAmount - release,
  });
}

export function applyReservationFromFill(
  state: AccountingState,
  fillQuantity: number,
  amountPerUnit: number,
): AccountingState {
  const fill = requirePositive(fillQuantity, "fillQuantity");
  const unitAmount = requirePositive(amountPerUnit, "amountPerUnit");
  return releaseReservation(state, fill * unitAmount);
}

export function reportRealizedPnl(
  state: AccountingState,
  pnl: number,
): AccountingState {
  const realized = requireFinite(pnl, "pnl");
  const cashBalance = Object.freeze({
    ...state.cashBalance,
    amount: state.cashBalance.amount + realized,
  });

  return withState(state, {
    realizedPnl: state.realizedPnl + realized,
    cashBalance,
    totalEquity: calculateEquity(cashBalance, state.unrealizedPnl),
  });
}

export function reportUnrealizedPnl(
  state: AccountingState,
  unrealizedPnl: number,
): AccountingState {
  const nextUnrealizedPnl = requireFinite(unrealizedPnl, "unrealizedPnl");
  return withState(state, {
    unrealizedPnl: nextUnrealizedPnl,
    totalEquity: calculateEquity(state.cashBalance, nextUnrealizedPnl),
  });
}

export function setPortfolio(
  state: AccountingState,
  portfolio: Portfolio,
): AccountingState {
  return withState(state, {
    portfolio,
    unrealizedPnl: portfolio.unrealizedPnl,
    totalEquity: calculateEquity(state.cashBalance, portfolio.unrealizedPnl),
  });
}

export function withWithdrawals(
  state: AccountingState,
  withdrawals: readonly {
    readonly amount: number;
    readonly description?: string;
    readonly txDate: string;
  }[],
): AccountingState {
  return withdrawals.reduce(
    (current, withdrawal) =>
      withdrawFromLedger(current, {
        category: "withdrawal",
        amount: withdrawal.amount,
        description: withdrawal.description,
        txDate: withdrawal.txDate,
      }),
    state,
  );
}

export function withDeposits(
  state: AccountingState,
  deposits: readonly {
    readonly amount: number;
    readonly description?: string;
    readonly txDate: string;
  }[],
): AccountingState {
  return deposits.reduce(
    (current, deposit) =>
      depositToLedger(current, {
        category: "deposit",
        amount: deposit.amount,
        description: deposit.description,
        txDate: deposit.txDate,
      }),
    state,
  );
}
