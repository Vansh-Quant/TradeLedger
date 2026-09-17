/**
 * Canonical trading account identity and lifecycle state.
 *
 * Account owns account-level identity and lifecycle concerns. Portfolio,
 * cash accounting, buying power, and broker connectivity are separate
 * responsibilities and are introduced by their respective domain models.
 */

export const ACCOUNT_STATUSES = ["active", "suspended", "closed"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export type AccountId = string & { readonly __brand: "AccountId" };

export interface AccountInput {
  readonly id: string;
  readonly baseCurrency: string;
}

export interface Account {
  readonly id: AccountId;
  readonly baseCurrency: string;
  readonly status: AccountStatus;
}

function requireNonEmpty(value: string, field: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new Error(`${field} must not be empty`);
  }

  return normalized;
}

function normalizeCurrency(value: string): string {
  return requireNonEmpty(value, "baseCurrency").toUpperCase();
}

function assertStatus(status: AccountStatus, allowed: readonly AccountStatus[], action: string): void {
  if (!allowed.includes(status)) {
    throw new Error(`cannot ${action} account from status ${status}`);
  }
}

/**
 * Creates an active, validated, immutable trading account.
 *
 * The account starts with no cash or portfolio state here. Those concerns are
 * deliberately modeled separately so the Account aggregate does not become a
 * catch-all for financial calculations.
 */
export function createAccount(input: AccountInput): Account {
  const account: Account = {
    id: requireNonEmpty(input.id, "id") as AccountId,
    baseCurrency: normalizeCurrency(input.baseCurrency),
    status: "active",
  };

  return Object.freeze(account);
}

export function suspendAccount(account: Account): Account {
  assertStatus(account.status, ["active"], "suspend");
  return Object.freeze({ ...account, status: "suspended" as const });
}

export function activateAccount(account: Account): Account {
  assertStatus(account.status, ["suspended"], "activate");
  return Object.freeze({ ...account, status: "active" as const });
}

export function closeAccount(account: Account): Account {
  assertStatus(account.status, ["active", "suspended"], "close");
  return Object.freeze({ ...account, status: "closed" as const });
}
