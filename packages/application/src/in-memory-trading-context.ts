import type { AccountId } from "@tradeledger/domain";
import type { TradingContext, TradingContextPort } from "./contracts.js";
import { ValidationError } from "./errors.js";

export class InMemoryTradingContext implements TradingContextPort {
  private readonly contexts = new Map<string, TradingContext>();

  constructor(initial: readonly TradingContext[] = []) {
    for (const context of initial) {
      this.contexts.set(context.accountId, context);
    }
  }

  getContext(accountId: AccountId): TradingContext {
    const context = this.contexts.get(accountId);

    if (context === undefined) {
      throw new ValidationError(`trading context ${accountId} was not found`);
    }

    return context;
  }

  saveContext(context: TradingContext): void {
    this.contexts.set(context.accountId, Object.freeze(context));
  }
}
