/**
 * Authentication policy for the workstation.
 *
 * Pure, dependency-free helpers so the route gate, the auth screen and the
 * tests all share one definition of "public", "signed out" and "safe to
 * redirect to". The API performs its own authorization — this gate exists for
 * user experience, never as a security boundary.
 */

export type AuthMode = "signin" | "signup" | "forgot" | "reset";

export const AUTH_MODES: readonly AuthMode[] = ["signin", "signup", "forgot", "reset"];

/**
 * Paths reachable without a session.
 *
 * `/` is the public entry boundary: today it forwards visitors into the
 * workstation or the auth screen, and the future marketing/landing page
 * replaces that one component — no route restructuring required. `/auth` is
 * the authentication screen. Everything else in this app is private.
 */
export const PUBLIC_PATHS: readonly string[] = ["/", "/auth"];

export function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PATHS.some(
    (path) => path !== "/" && (pathname === path || pathname.startsWith(path + "/")),
  );
}

/**
 * Validates a post-login redirect destination.
 *
 * Returns only same-origin absolute paths: rejects empty values, external
 * URLs (`https://…`), protocol-relative URLs (`//evil.example`) and
 * backslash tricks (`/\evil.example`) so login cannot be used as an open
 * redirect. Falls back to `undefined` (caller chooses its own default).
 */
export function sanitizeRedirect(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 512) return undefined;
  if (!trimmed.startsWith("/")) return undefined;
  if (trimmed.startsWith("//") || trimmed.startsWith("/\\")) return undefined;
  // "/http:…" or any path segment containing a scheme delimiter.
  if (/^\/[^/?#]*:/.test(trimmed)) return undefined;
  if (trimmed.includes("\\")) return undefined;
  return trimmed;
}

export type AuthGate =
  /** Public path: render without a session. */
  | { readonly kind: "public" }
  /** Session state still resolving: show the loading screen. */
  | { readonly kind: "loading" }
  /** Signed out of a private route: send the user to the sign-in screen. */
  | { readonly kind: "sign-in"; readonly redirect: string }
  /** Production build without Supabase configuration: hard stop with a notice. */
  | { readonly kind: "blocked" }
  /** Signed in (or development without Supabase): render the workstation. */
  | { readonly kind: "render" };

export interface AuthGateInput {
  readonly pathname: string;
  /** True once the initial session lookup has resolved. */
  readonly ready: boolean;
  /** True when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are present. */
  readonly configured: boolean;
  readonly hasSession: boolean;
  /** `import.meta.env.PROD`. */
  readonly isProduction: boolean;
}

export function authGate(input: AuthGateInput): AuthGate {
  if (isPublicPath(input.pathname)) return { kind: "public" };
  if (!input.configured) {
    // A production bundle without Supabase must not expose the workstation.
    // Development keeps working without an auth backend; the API still
    // enforces its own authentication independently of this gate.
    return input.isProduction ? { kind: "blocked" } : { kind: "render" };
  }
  if (!input.ready) return { kind: "loading" };
  if (!input.hasSession) return { kind: "sign-in", redirect: input.pathname };
  return { kind: "render" };
}

/** Friendly copy for Supabase auth errors — never echoes token material. */
export function friendlyAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";
  const haystack = `${code} ${message}`.toLowerCase();
  if (haystack.includes("invalid login credentials")) return "Email or password is incorrect.";
  if (haystack.includes("user not found") || haystack.includes("user_not_found"))
    return "Email or password is incorrect.";
  if (haystack.includes("email not confirmed"))
    return "Confirm your email address first, then sign in.";
  if (haystack.includes("already registered") || haystack.includes("already been registered"))
    return "That email is already registered. Try signing in.";
  if (haystack.includes("password should be at least"))
    return "Password must be at least 8 characters.";
  if (haystack.includes("rate limit") || haystack.includes("too many requests"))
    return "Too many attempts. Wait a moment and try again.";
  if (haystack.includes("failed to fetch") || haystack.includes("network"))
    return "Could not reach the sign-in service. Check your connection and try again.";
  if (haystack.includes("session_expired") || haystack.includes("refresh token"))
    return "Your session has expired. Sign in again.";
  return "Something went wrong. Please try again.";
}
