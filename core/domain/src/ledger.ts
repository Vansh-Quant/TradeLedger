import type { Account } from "./account.js";
import type { Position } from "./position.js";
import type { Portfolio } from "./portfolio.js";

export interface LedgerTx {
  readonly ledgerId: string;
  readonly accountId: string;
  readonly txDate: string;
  readonly description: string | undefined;
  readonly status: "pending" | "applied" | "reversed";
}

export interface LedgerEntry {
  readonly ledgerId: string;
  readonly accountId: string;
  readonly txDate: string;
  readonly description: string | undefined;
  readonly category: string;
  readonly debit: number;
  readonly credit: number;
  readonly status: "pending" | "applied" | "reversed";
}

export interface BookedEntry {
  readonly ledgerId: string;
  readonly accountId: string;
  readonly txDate: string;
  readonly description: string | undefined;
  readonly category: string;
  readonly amount: number;
  readonly currency: string;
  readonly status: "pending" | "applied" | "reversed";
}

export interface AccountingState {
  readonly account: Account;
  readonly cashBalance: { readonly currency: string; readonly amount: number };
  readonly portfolio: Portfolio;
  readonly ledger: readonly LedgerEntry[];
  readonly booked: readonly BookedEntry[];
  readonly realizedPnl: number;
  readonly unrealizedPnl: number;
  readonly totalEquity: number;
  readonly reservedAmount: number;
}

function requireNonNegative(value: number, field: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${field} must be finite`);
  }
  if (value < 0) {
    throw new Error(`${field} must be non-negative`);
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

function requireValidCurrency(value: string): string {
  const normalized = requireNonEmpty(value, "currency").toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error("currency must be a three-letter ISO code");
  }
  return normalized;
}

function requireValidDate(value: string): string {
  const normalized = requireNonEmpty(value, "txDate");
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) {
    throw new Error("txDate must be a valid date");
  }
  return normalized;
}

function assertStatus(status: "pending" | "applied" | "reversed", field: string): void {
  if (status !== "pending" && status !== "applied" && status !== "reversed") {
    throw new Error(`${field} must be pending, applied, or reversed`);
  }
}

function createLedgerId(): string {
  return crypto.randomUUID();
}

export function createCashBalance(currency: string, amount = 0): { readonly currency: string; readonly amount: number } {
  const balance: { readonly currency: string; readonly amount: number } = {
    currency: requireValidCurrency(currency),
    amount: requireNonNegative(amount, "amount"),
  };
  return Object.freeze(balance);
}

export function depositCash(balance: { readonly currency: string; readonly amount: number }, amount: number): { readonly currency: string; readonly amount: number } {
  const deposit = requireNonNegative(amount, "amount");
  if (deposit === 0) {
    throw new Error("amount must be positive");
  }
  return Object.freeze({ ...balance, amount: balance.amount + deposit });
}

export function withdrawCash(balance: { readonly currency: string; readonly amount: number }, amount: number): { readonly currency: string; readonly amount: number } {
  const withdrawal = requireNonNegative(amount, "amount");
  if (withdrawal === 0) {
    throw new Error("amount must be positive");
  }
  if (withdrawal > balance.amount) {
    throw new Error("withdrawal amount exceeds available cash");
  }
  return Object.freeze({ ...balance, amount: balance.amount - withdrawal });
}

export function calculateEquity(balance: { readonly currency: string; readonly amount: number }, unrealizedPnl: number): number {
  return balance.amount + requireNonNegative(unrealizedPnl, "unrealizedPnl");
}

export function createLedgerEntry(input: {
  readonly ledgerId: string;
  readonly accountId: string;
  readonly txDate: string;
  readonly description: string | undefined;
  readonly category: string;
  readonly debit: number;
  readonly credit: number;
  readonly status: "pending" | "applied" | "reversed";
}): LedgerEntry {
  const ledgerId = requireNonEmpty(input.ledgerId, "ledgerId");
  const accountId = requireNonEmpty(input.accountId, "accountId");
  const txDate = requireValidDate(input.txDate);
  const description = input.description === undefined ? undefined : input.description.trim();
  const category = requireNonEmpty(input.category, "category");
  const debit = requireNonNegative(input.debit, "debit");
  const credit = requireNonNegative(input.credit, "credit");
  assertStatus(input.status, "status");

  const total = debit + credit;
  if (total === 0) {
    throw new Error("debit + credit must be greater than zero");
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
  readonly description: string | undefined;
  readonly category: string;
  readonly amount: number;
  readonly currency: string;
  readonly status: "pending" | "applied" | "reversed";
}): BookedEntry {
  const ledgerId = requireNonEmpty(input.ledgerId, "ledgerId");
  const accountId = requireNonEmpty(input.accountId, "accountId");
  const txDate = requireValidDate(input.txDate);
  const description = input.description === undefined ? undefined : input.description.trim();
  const category = requireNonEmpty(input.category, "category");
  const amount = requireNonNegative(input.amount, "amount");
  const currency = requireValidCurrency(input.currency);
  assertStatus(input.status, "status");

  return Object.freeze({
    ledgerId,
    accountId,
    txDate,
    description,
    category,
    amount,
    currency,
    status: input.status,
  });
}

export function createAccountingState(input: {
  readonly account: Account;
  readonly cashBalance: { readonly currency: string; readonly amount: number };
  readonly portfolio: Portfolio;
  readonly ledger: readonly LedgerEntry[];
  readonly booked: readonly BookedEntry[];
  readonly realizedPnl: number;
  readonly unrealizedPnl: number;
  readonly totalEquity: number;
  readonly reservedAmount: number;
}): AccountingState {
  const account = input.account;
  const cashBalance = input.cashBalance;
  const portfolio = input.portfolio;
  const ledger = Object.freeze(input.ledger.slice());
  const booked = Object.freeze(input.booked.slice());
  const realizedPnl = requireNonNegative(input.realizedPnl, "realizedPnl");
  const unrealizedPnl = requireNonNegative(input.unrealizedPnl, "unrealizedPnl");
  const totalEquity = requireNonNegative(input.totalEquity, "totalEquity");
  const reservedAmount = requireNonNegative(input.reservedAmount, "reservedAmount");

  return Object.freeze({
    account,
    cashBalance,
    portfolio,
    ledger,
    booked,
    realizedPnl,
    unrealizedPnl,
    totalEquity,
    reservedAmount,
  });
}

export function depositToLedger(
  state: AccountingState,
  input: {
    readonly category: string;
    readonly amount: number;
    readonly description: string | undefined;
    readonly txDate?: string;
  },
): AccountingState {
  const ledgerId = createLedgerId();
  const nextLedger = [
    ...state.ledger,
    createLedgerEntry({
      ledgerId,
      accountId: state.account.id,
      txDate: input.txDate ?? state.cashBalance.currency,
      description: input.description,
      category: input.category,
      debit: 0,
      credit: input.amount,
      status: "applied",
    }),
  ];

  return Object.freeze({
    ...state,
    ledger: nextLedger,
    cashBalance: depositCash(state.cashBalance, input.amount),
    totalEquity: calculateEquity(state.cashBalance, state.unrealizedPnl),
  });
}

export function withdrawFromLedger(
  state: AccountingState,
  input: {
    readonly category: string;
    readonly amount: number;
    readonly description: string | undefined;
    readonly txDate?: string;
  },
): AccountingState {
  const ledgerId = createLedgerId();
  const nextLedger = [
    ...state.ledger,
    createLedgerEntry({
      ledgerId,
      accountId: state.account.id,
      txDate: input.txDate ?? state.cashBalance.currency,
      description: input.description,
      category: input.category,
      debit: input.amount,
      credit: 0,
      status: "applied",
    }),
  ];

  return Object.freeze({
    ...state,
    ledger: nextLedger,
    cashBalance: withdrawCash(state.cashBalance, input.amount),
    totalEquity: calculateEquity(state.cashBalance, state.unrealizedPnl),
  });
}

export function reserveCash(
  state: AccountingState,
  amount: number,
): AccountingState {
  const reservation = requireNonNegative(amount, "amount");
  return Object.freeze({
    ...state,
    reservedAmount: state.reservedAmount + reservation,
    totalEquity: calculateEquity(state.cashBalance, state.unrealizedPnl),
  });
}

export function releaseReservation(
  state: AccountingState,
  amount: number,
): AccountingState {
  const release = requireNonNegative(amount, "amount");
  if (release > state.reservedAmount) {
    throw new Error("release amount exceeds reserved amount");
  }
  return Object.freeze({
    ...state,
    reservedAmount: state.reservedAmount - release,
    totalEquity: calculateEquity(state.cashBalance, state.unrealizedPnl),
  });
}

export function applyReservationFromFill(
  state: AccountingState,
  fillQuantity: number,
  amountPerUnit: number,
): AccountingState {
  const fill = requireNonNegative(fillQuantity, "fillQuantity");
  const release = amountPerUnit * fill;
  return releaseReservation(state, release);
}

export function reportRealizedPnl(state: AccountingState, pnl: number): AccountingState {
  const realized = requireNonNegative(pnl, "pnl");
  return Object.freeze({
    ...state,
    realizedPnl: state.realizedPnl + realized,
    cashBalance: Object.freeze({ ...state.cashBalance, amount: state.cashBalance.amount + realized }),
    totalEquity: calculateEquity(state.cashBalance, state.unrealizedPnl),
  });
}

export function reportUnrealizedPnl(
  state: AccountingState,
  unrealizedPnl: number,
): AccountingState {
  const change = requireNonNegative(unrealizedPnl, "unrealizedPnl");
  return Object.freeze({
    ...state,
    unrealizedPnl: state.unrealizedPnl + change,
    totalEquity: calculateEquity(state.cashBalance, state.unrealizedPnl),
  });
}

export function setPortfolio(
  state: AccountingState,
  portfolio: Portfolio,
): AccountingState {
  return Object.freeze({
    ...state,
    portfolio,
    unrealizedPnl: portfolio.unrealizedPnl,
    totalEquity: calculateEquity(state.cashBalance, portfolio.unrealizedPnl),
  });
}

export function withWithdrawals(
  state: AccountingState,
  withdrawals: readonly { readonly amount: number; readonly description?: string }[],
): AccountingState {
  let result = state;
  for (const w of withdrawals) {
    result = withdrawFromLedger(result, { category: "withdrawal", amount: w.amount, description: w.description });
  }
  return result;
}

export function withDeposits(
  state: AccountingState,
  deposits: readonly { readonly amount: number; readonly description?: string }[],
): AccountingState {
  let result = state;
  for (const d of deposits) {
    result = depositToLedger(result, { category: "deposit", amount: d.amount, description: d.description });
  }
  return result;
}
