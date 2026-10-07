import type { AccountId } from "./account.js";
import type { TradingWorkspace } from "./trading-workspace.js";

export interface TerminalSession {
  readonly id: string;
  readonly accountIds: readonly AccountId[];
  readonly activeAccountId: AccountId;
  readonly workspace: TradingWorkspace;
}

function nonEmpty(value: string, field: string): string {
  const v = value.trim();
  if (!v) throw new Error(field + " must not be empty");
  return v;
}

export function createTerminalSession(input: {
  readonly id: string;
  readonly accountIds: readonly AccountId[];
  readonly activeAccountId: AccountId;
  readonly workspace: TradingWorkspace;
}): TerminalSession {
  const accounts = [...new Set(input.accountIds)];
  if (accounts.length === 0) throw new Error("accountIds must not be empty");
  if (!accounts.includes(input.activeAccountId)) throw new Error("activeAccountId must belong to accountIds");
  if (input.workspace.accountId !== input.activeAccountId) {
    throw new Error("workspace account must match active account");
  }
  return Object.freeze({
    id: nonEmpty(input.id, "id"),
    accountIds: Object.freeze(accounts),
    activeAccountId: input.activeAccountId,
    workspace: input.workspace,
  });
}

export function switchTerminalAccount(
  session: TerminalSession,
  accountId: AccountId,
  workspace: TradingWorkspace,
): TerminalSession {
  if (!session.accountIds.includes(accountId)) throw new Error("account is not part of terminal session");
  if (workspace.accountId !== accountId) throw new Error("workspace account must match active account");
  return Object.freeze({ ...session, activeAccountId: accountId, workspace });
}
