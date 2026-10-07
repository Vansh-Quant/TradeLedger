import { describe, expect, it } from "vitest";
import {
  createTerminalSession,
  createTradingWorkspace,
  switchTerminalAccount,
  type AccountId,
} from "../../core/domain/src/index.js";

describe("terminal session", () => {
  it("supports multiple accounts and switching", () => {
    const a = "ACC-1" as AccountId;
    const b = "ACC-2" as AccountId;
    const session = createTerminalSession({
      id: "TERM-1",
      accountIds: [a, b],
      activeAccountId: a,
      workspace: createTradingWorkspace(a),
    });

    const next = switchTerminalAccount(session, b, createTradingWorkspace(b));
    expect(next.activeAccountId).toBe(b);
    expect(next.accountIds).toEqual([a, b]);
  });
});
