import { describe, expect, it } from "vitest";
import {
  activateAccount,
  closeAccount,
  createAccount,
  suspendAccount,
} from "../../core/domain/src/account.js";

describe("Account", () => {
  it("creates an active account with normalized base currency", () => {
    const account = createAccount({ id: "account-001", baseCurrency: " usd " });

    expect(account.id).toBe("account-001");
    expect(account.baseCurrency).toBe("USD");
    expect(account.status).toBe("active");
    expect(Object.isFrozen(account)).toBe(true);
  });

  it("rejects an empty identity or base currency", () => {
    expect(() => createAccount({ id: "", baseCurrency: "USD" })).toThrow(
      "id must not be empty",
    );
    expect(() => createAccount({ id: "account-001", baseCurrency: "   " })).toThrow(
      "baseCurrency must not be empty",
    );
  });

  it("suspends an active account", () => {
    const account = createAccount({ id: "account-001", baseCurrency: "USD" });
    const suspended = suspendAccount(account);

    expect(account.status).toBe("active");
    expect(suspended.status).toBe("suspended");
    expect(suspended.id).toBe(account.id);
  });

  it("reactivates a suspended account", () => {
    const account = createAccount({ id: "account-001", baseCurrency: "USD" });
    const suspended = suspendAccount(account);
    const active = activateAccount(suspended);

    expect(active.status).toBe("active");
    expect(Object.isFrozen(active)).toBe(true);
  });

  it("closes an active or suspended account", () => {
    const active = createAccount({ id: "account-001", baseCurrency: "USD" });
    const closedActive = closeAccount(active);
    expect(closedActive.status).toBe("closed");

    const suspended = suspendAccount(createAccount({ id: "account-002", baseCurrency: "EUR" }));
    const closedSuspended = closeAccount(suspended);
    expect(closedSuspended.status).toBe("closed");
  });

  it("rejects invalid lifecycle transitions", () => {
    const active = createAccount({ id: "account-001", baseCurrency: "USD" });
    const suspended = suspendAccount(active);
    const closed = closeAccount(active);

    expect(() => suspendAccount(suspended)).toThrow(
      "cannot suspend account from status suspended",
    );
    expect(() => activateAccount(active)).toThrow(
      "cannot activate account from status active",
    );
    expect(() => activateAccount(closed)).toThrow(
      "cannot activate account from status closed",
    );
    expect(() => closeAccount(closed)).toThrow(
      "cannot close account from status closed",
    );
  });
});
