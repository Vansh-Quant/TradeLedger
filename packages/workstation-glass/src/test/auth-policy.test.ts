import { describe, expect, it } from "vitest";
import { authGate, friendlyAuthError, isPublicPath, sanitizeRedirect } from "@/lib/auth-policy";

describe("isPublicPath", () => {
  it("marks only the entry boundary and the auth screens as public", () => {
    expect(isPublicPath("/")).toBe(true);
    expect(isPublicPath("/auth")).toBe(true);
    expect(isPublicPath("/auth?mode=signup")).toBe(false); // pathname only
  });

  it("keeps every workstation route private", () => {
    for (const path of [
      "/dashboard",
      "/trading",
      "/journal",
      "/research",
      "/settings",
      "/backtesting",
      "/orders",
    ]) {
      expect(isPublicPath(path)).toBe(false);
    }
  });

  it("does not treat prefix twins as public", () => {
    expect(isPublicPath("/authorize")).toBe(false);
    expect(isPublicPath("/dashboard/../../etc")).toBe(false);
  });
});

describe("sanitizeRedirect", () => {
  it("keeps same-origin absolute paths", () => {
    expect(sanitizeRedirect("/dashboard")).toBe("/dashboard");
    expect(sanitizeRedirect("/journal")).toBe("/journal");
    expect(sanitizeRedirect("/trading?symbol=XAUUSD")).toBe("/trading?symbol=XAUUSD");
  });

  it("rejects open-redirect shapes", () => {
    expect(sanitizeRedirect("https://evil.example")).toBeUndefined();
    expect(sanitizeRedirect("//evil.example")).toBeUndefined();
    expect(sanitizeRedirect("/\\evil.example")).toBeUndefined();
    expect(sanitizeRedirect("/\\/evil.example")).toBeUndefined();
    expect(sanitizeRedirect("javascript:alert(1)")).toBeUndefined();
    expect(sanitizeRedirect("/javascript:alert(1)")).toBeUndefined();
    expect(sanitizeRedirect("/\\tevil")).toBeUndefined();
  });

  it("rejects empty, oversized and malformed values", () => {
    expect(sanitizeRedirect(undefined)).toBeUndefined();
    expect(sanitizeRedirect(null)).toBeUndefined();
    expect(sanitizeRedirect("")).toBeUndefined();
    expect(sanitizeRedirect("   ")).toBeUndefined();
    expect(sanitizeRedirect("/" + "a".repeat(600))).toBeUndefined();
    expect(sanitizeRedirect(42 as unknown as string)).toBeUndefined();
  });
});

describe("authGate", () => {
  const base = { ready: true, configured: true, hasSession: true, isProduction: false };

  it("renders public paths without a session", () => {
    expect(authGate({ ...base, pathname: "/auth", hasSession: false }).kind).toBe("public");
    expect(authGate({ ...base, pathname: "/", hasSession: false }).kind).toBe("public");
  });

  it("redirects signed-out private routes to sign-in, preserving the destination", () => {
    const decision = authGate({ ...base, pathname: "/journal", hasSession: false });
    expect(decision).toEqual({ kind: "sign-in", redirect: "/journal" });
  });

  it("waits for session restoration before deciding", () => {
    expect(
      authGate({ ...base, pathname: "/dashboard", ready: false, hasSession: false }).kind,
    ).toBe("loading");
  });

  it("renders private routes for an authenticated session", () => {
    expect(authGate({ ...base, pathname: "/dashboard" }).kind).toBe("render");
  });

  it("blocks unconfigured production builds but keeps local development usable", () => {
    expect(
      authGate({ ...base, pathname: "/dashboard", configured: false, isProduction: true }).kind,
    ).toBe("blocked");
    expect(
      authGate({ ...base, pathname: "/dashboard", configured: false, isProduction: false }).kind,
    ).toBe("render");
  });
});

describe("friendlyAuthError", () => {
  it("maps credential failures without echoing internals", () => {
    expect(friendlyAuthError(new Error("Invalid login credentials"))).toBe(
      "Email or password is incorrect.",
    );
    expect(friendlyAuthError({ code: "user_not_found", message: "User not found" })).toBe(
      "Email or password is incorrect.",
    );
    expect(friendlyAuthError(new Error("Email not confirmed"))).toBe(
      "Confirm your email address first, then sign in.",
    );
    expect(friendlyAuthError(new Error("Password should be at least 8 characters"))).toMatch(
      /at least 8/,
    );
  });

  it("falls back to a generic message", () => {
    expect(friendlyAuthError(new Error("totally unexpected"))).toBe(
      "Something went wrong. Please try again.",
    );
    expect(friendlyAuthError(undefined)).toBe("Something went wrong. Please try again.");
    expect(friendlyAuthError("boom")).toBe("Something went wrong. Please try again.");
  });

  it("never leaks token-shaped values", () => {
    const message = friendlyAuthError(new Error("jwt: Bearer eyJhbGciOi.foo.bar failed"));
    expect(message).not.toContain("eyJ");
    expect(message).not.toContain("Bearer");
  });
});
