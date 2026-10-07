import type { Execution } from "./execution.js";
import {
  applyExecutionToAccountPortfolio,
  type AccountPortfolio,
} from "./account-portfolio.js";
import {
  createAccountingState,
  createLedgerEntry,
  type AccountingState,
} from "./ledger.js";
import { calculateEquity } from "./cash.js";
import type { Portfolio } from "./portfolio.js";

export interface ExecutionSettlementResult {
  readonly state: AccountingState;
  readonly accountPortfolio: AccountPortfolio;
  readonly portfolio: Portfolio;
  readonly cashDelta: number;
  readonly commission: number;
  readonly realizedPnlDelta: number;
}

function requireFiniteNonNegative(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(field + " must be finite and non-negative");
  }
  return value;
}

/**
 * Settles an execution into deterministic account accounting.
 *
 * Buys reduce cash by notional plus commission. Sells increase cash by
 * proceeds less commission. Position state is derived from the execution,
 * while realized P&L comes from the position's realized-P&L delta with the
 * execution commission deducted.
 */
export function settleExecution(
  state: AccountingState,
  execution: Execution,
): ExecutionSettlementResult {
  const existingEntry = state.ledger.find(
    (entry) => entry.ledgerId === execution.id,
  );
  if (existingEntry !== undefined) {
    throw new Error("execution has already been settled");
  }

  const commission = requireFiniteNonNegative(
    execution.commission,
    "execution.commission",
  );
  const notional = execution.quantity * execution.price;
  const cashDelta =
    execution.side === "buy"
      ? -(notional + commission)
      : notional - commission;

  const accountPortfolio: AccountPortfolio = applyExecutionToAccountPortfolio(
    {
      accountId: state.account.id,
      portfolio: state.portfolio,
    },
    execution,
  );

  const previousRealized = state.portfolio.realizedPnl;
  const nextRealized = accountPortfolio.portfolio.realizedPnl;
  const realizedPnlDelta = nextRealized - previousRealized - commission;

  const nextCashAmount = state.cashBalance.amount + cashDelta;
  if (nextCashAmount < 0) {
    throw new Error("execution settlement would make cash negative");
  }

  const nextCash = Object.freeze({
    ...state.cashBalance,
    amount: nextCashAmount,
  });

  const ledgerEntry = createLedgerEntry({
    ledgerId: execution.id,
    accountId: state.account.id,
    txDate: execution.executedAt,
    description: "Execution settlement " + execution.id,
    category: "execution",
    debit: cashDelta < 0 ? -cashDelta : 0,
    credit: cashDelta > 0 ? cashDelta : 0,
    status: "applied",
  });

  const nextState = createAccountingState({
    account: state.account,
    cashBalance: nextCash,
    portfolio: accountPortfolio.portfolio,
    ledger: [...state.ledger, ledgerEntry],
    booked: state.booked,
    realizedPnl: state.realizedPnl + realizedPnlDelta,
    unrealizedPnl: state.unrealizedPnl,
    totalEquity: calculateEquity(nextCash, state.unrealizedPnl),
    reservedAmount: state.reservedAmount,
  });

  return Object.freeze({
    state: nextState,
    accountPortfolio,
    portfolio: accountPortfolio.portfolio,
    cashDelta,
    commission,
    realizedPnlDelta,
  });
}
