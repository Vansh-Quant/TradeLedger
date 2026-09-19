import type { Account } from "./account.js";
import type { Execution } from "./execution.js";
import { applyFill, createPosition } from "./position.js";
import { setPosition, type Portfolio } from "./portfolio.js";

export interface AccountPortfolio {
  readonly accountId: Account["id"];
  readonly portfolio: Portfolio;
}

export function createAccountPortfolio(
  account: Account,
  portfolio: Portfolio,
): AccountPortfolio {
  return Object.freeze({
    accountId: account.id,
    portfolio,
  });
}

/**
 * Applies an actual execution to the portfolio associated with the account.
 *
 * Execution remains the source of truth for what happened; this function only
 * derives the corresponding position and updated portfolio state.
 */
export function applyExecutionToAccountPortfolio(
  accountPortfolio: AccountPortfolio,
  execution: Execution,
): AccountPortfolio {
  const currentPosition =
    accountPortfolio.portfolio.positions.get(execution.instrumentId) ??
    createPosition(execution.instrumentId);

  const updatedPosition = applyFill(currentPosition, execution.side, {
    quantity: execution.quantity,
    price: execution.price,
  });

  return Object.freeze({
    accountId: accountPortfolio.accountId,
    portfolio: setPosition(accountPortfolio.portfolio, updatedPosition),
  });
}
