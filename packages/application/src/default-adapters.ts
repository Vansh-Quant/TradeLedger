import type {
  AccountId,
  TradingCoreState,
} from "@tradeledger/domain";
import type {
  AuthorizationPort,
  ApplicationAction,
  ApplicationPrincipal,
  OrderIdGenerator,
  OrderStatePort,
} from "./contracts.js";
import { AuthorizationError } from "./errors.js";

export class InMemoryOrderStateStore implements OrderStatePort {
  private readonly states = new Map<string, TradingCoreState>();

  save(state: TradingCoreState): void {
    this.states.set(state.order.id, state);
  }

  get(orderId: string): TradingCoreState | undefined {
    return this.states.get(orderId);
  }
}

export class RandomOrderIdGenerator implements OrderIdGenerator {
  next(): string {
    return crypto.randomUUID();
  }
}

export class AllowListedAuthorization implements AuthorizationPort {
  private readonly permissions: ReadonlySet<string>;

  constructor(permissions: readonly string[]) {
    this.permissions = new Set(permissions);
  }

  authorize(
    principal: ApplicationPrincipal,
    action: ApplicationAction,
    accountId: AccountId,
  ): void {
    const keys = [
      `${principal.id}:${action}:${accountId}`,
      `role:${action}`,
      `role:${action}:${accountId}`,
    ];

    if (!keys.some((key) => this.permissions.has(key))) {
      throw new AuthorizationError(
        `principal ${principal.id} is not authorized for ${action}`,
      );
    }
  }
}
