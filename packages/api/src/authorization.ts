import {
  AuthorizationError,
  type ApplicationAction,
  type ApplicationPrincipal,
  type AuthorizationPort,
} from "@tradeledger/application";
import type { AccountId } from "@tradeledger/domain";

/**
 * Server-side authorization policy for the HTTP API.
 *
 * Two independent checks run for every authorized action:
 *
 * 1. The account must be one this deployment actually serves. A request that
 *    supplies another account's id is rejected with 403 — client-supplied
 *    account ids are never trusted as an ownership claim by themselves.
 * 2. Read-only principals (role "viewer") may only perform read actions.
 *
 * In the single-trader deployment every verified principal that passes check 1
 * maps to the configured trading accounts; the identity itself always comes
 * from verified authentication claims, never from the request payload.
 */
const READ_ACTIONS: ReadonlySet<ApplicationAction> = new Set<ApplicationAction>([
  "order.read",
  "market-data.read",
  "event-stream.read",
]);

export class AccountScopedAuthorization implements AuthorizationPort {
  private readonly accounts: ReadonlySet<string>;
  private readonly actions: ReadonlySet<ApplicationAction>;

  constructor(options: {
    /** Account ids this deployment serves, e.g. ["ACC-APP"]. */
    readonly accountIds: readonly string[];
    /** Actions permitted; defaults to every application action. */
    readonly actions?: readonly ApplicationAction[];
  }) {
    if (options.accountIds.length === 0) throw new Error("at least one account id is required");
    this.accounts = new Set(options.accountIds);
    this.actions = new Set(options.actions ?? [
      "order.submit", "order.cancel", "order.expire", "order.read",
      "market-data.read", "research.run", "execution.record", "event-stream.read",
    ]);
  }

  authorize(principal: ApplicationPrincipal, action: ApplicationAction, accountId: AccountId): void {
    if (!this.accounts.has(accountId)) {
      // Deliberately does not reveal which accounts exist.
      throw new AuthorizationError(`principal ${principal.id} is not authorized for ${action}`);
    }
    if (!this.actions.has(action)) {
      throw new AuthorizationError(`principal ${principal.id} is not authorized for ${action}`);
    }
    const readOnly = principal.roles.includes("viewer") && !principal.roles.some(
      (role) => role === "owner" || role === "trader",
    );
    if (readOnly && !READ_ACTIONS.has(action)) {
      throw new AuthorizationError(`principal ${principal.id} is not authorized for ${action}`);
    }
  }
}