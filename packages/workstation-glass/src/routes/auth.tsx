import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { isHostedJournalConfigured, supabase } from "@/lib/supabase-client";
import {
  isUserNotFound,
  sendPasswordResetEmail,
  signInToJournal,
  signUpForJournal,
  updateAccountPassword,
} from "@/lib/journal-cloud";
import { friendlyAuthError, sanitizeRedirect, type AuthMode } from "@/lib/auth-policy";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({
    /** signin (default) | signup | forgot | reset */
    mode: z.enum(["signin", "signup", "forgot", "reset"]).optional(),
    /** Where to go after a successful action — validated, same-origin only. */
    redirect: z.string().optional(),
  }),
  head: () => ({
    meta: [
      { title: "Sign in — TradeLedger" },
      { name: "description", content: "Sign in to your TradeLedger workstation." },
      // The auth screen must never appear in search results.
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AuthPage,
});

const inputClass =
  "mt-1 h-9 w-full rounded-sm border border-input bg-background/60 px-2 text-xs outline-none focus:border-primary";
const buttonClass =
  "inline-flex h-9 w-full items-center justify-center gap-2 rounded-sm bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary";

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const mode: AuthMode = search.mode ?? "signin";
  const redirectTo = sanitizeRedirect(search.redirect) ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [recoverySessionReady, setRecoverySessionReady] = useState(!isHostedJournalConfigured);

  // After a recovery-link click Supabase exchanges the code for a session
  // (detectSessionInUrl); wait for it before accepting a new password.
  useEffect(() => {
    if (!supabase || mode !== "reset") return;
    let active = true;
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setRecoverySessionReady(Boolean(data.session));
      })
      .catch(() => {
        if (active) setRecoverySessionReady(false);
      });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active && session) setRecoverySessionReady(true);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [mode]);

  const go = (next: AuthMode) => {
    setError(null);
    setNotice(null);
    void navigate({
      to: "/auth",
      search: {
        mode: next,
        ...(search.redirect === undefined ? {} : { redirect: search.redirect }),
      },
      replace: true,
    });
  };

  const finish = () => void navigate({ to: redirectTo, replace: true });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setNotice(null);
    const address = email.trim().toLowerCase();

    if (!address || !password) {
      setError("Email and password are required.");
      return;
    }
    if (mode === "reset" && password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "signin") {
        await signInToJournal(address, password);
        finish();
      } else if (mode === "signup") {
        if (password.length < 8) {
          setError("Password must be at least 8 characters.");
          return;
        }
        const result = await signUpForJournal(address, password);
        if (result.confirmationRequired) {
          setConfirmationSent(true);
        } else {
          finish();
        }
      } else if (mode === "forgot") {
        try {
          await sendPasswordResetEmail(address);
        } catch (mailError) {
          // Never reveal whether the address has an account.
          if (!isUserNotFound(mailError)) throw mailError;
        }
        setNotice(
          "If an account exists for that address, a recovery email is on its way. The link expires — check your inbox and spam folder.",
        );
      } else if (mode === "reset") {
        if (password.length < 8) {
          setError("Password must be at least 8 characters.");
          return;
        }
        await updateAccountPassword(password);
        setNotice("Password updated. Taking you to your workstation…");
        setTimeout(finish, 600);
      }
    } catch (caught) {
      setError(friendlyAuthError(caught));
    } finally {
      setBusy(false);
    }
  }

  const titles: Record<AuthMode, string> = {
    signin: "Sign in",
    signup: "Create your account",
    forgot: "Reset your password",
    reset: "Choose a new password",
  };

  if (!isHostedJournalConfigured) {
    return (
      <Shell>
        <div className="panel w-full max-w-sm p-6">
          <h1 className="text-base font-semibold">{titles[mode]}</h1>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Hosted sign-in is not configured for this build. Set the Supabase project URL and
            publishable key (<span className="num">VITE_SUPABASE_URL</span>,{" "}
            <span className="num">VITE_SUPABASE_ANON_KEY</span>) and rebuild — see DEPLOYMENT.md.
          </p>
          {import.meta.env.DEV && (
            <button type="button" onClick={finish} className={buttonClass + " mt-4"}>
              Continue in local development
            </button>
          )}
        </div>
      </Shell>
    );
  }

  if (confirmationSent) {
    return (
      <Shell>
        <div className="panel w-full max-w-sm p-6">
          <h1 className="text-base font-semibold">Confirm your email</h1>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            We sent a confirmation link to <span className="num text-foreground">{email}</span>.
            Open it to activate your account, then sign in.
          </p>
          <button type="button" onClick={() => go("signin")} className={buttonClass + " mt-4"}>
            Back to sign in
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <form onSubmit={submit} className="panel w-full max-w-sm p-6" noValidate>
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 32 32" className="size-6" aria-hidden>
            <path d="M16 2 30 16 16 30 2 16Z" fill="none" stroke="var(--primary)" strokeWidth="2" />
            <path d="M16 9 23 16 16 23 9 16Z" fill="var(--primary)" />
          </svg>
          <div>
            <h1 className="text-base font-semibold leading-none">{titles[mode]}</h1>
            <p className="mt-1 text-[11px] text-muted-foreground">
              TradeLedger · deterministic trading OS
            </p>
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-sm border border-negative/40 bg-negative/10 px-3 py-2 text-xs text-negative"
          >
            {error}
          </p>
        )}
        {notice && (
          <p
            role="status"
            className="mt-4 rounded-sm border border-positive/40 bg-positive/10 px-3 py-2 text-xs text-positive"
          >
            {notice}
          </p>
        )}

        {mode === "reset" && !recoverySessionReady && (
          <p
            role="alert"
            className="mt-4 rounded-sm border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning"
          >
            This recovery link is invalid or has expired.
            <button type="button" onClick={() => go("forgot")} className="ml-1 underline">
              Request a new one
            </button>
          </p>
        )}

        <div className="mt-4 space-y-3">
          {mode !== "reset" && (
            <label className="block text-xs font-medium">
              Email
              <input
                className={inputClass}
                type="email"
                name="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
          )}

          {mode !== "forgot" && (
            <label className="block text-xs font-medium">
              Password
              <input
                className={inputClass}
                type="password"
                name="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                minLength={8}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
          )}

          {mode === "reset" && (
            <label className="block text-xs font-medium">
              Confirm new password
              <input
                className={inputClass}
                type="password"
                name="confirm-password"
                autoComplete="new-password"
                minLength={8}
                required
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </label>
          )}
        </div>

        <button
          type="submit"
          disabled={busy || (mode === "reset" && !recoverySessionReady)}
          className={buttonClass + " mt-5"}
        >
          {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          {busy
            ? "Please wait…"
            : mode === "signin"
              ? "Sign in"
              : mode === "signup"
                ? "Create account"
                : mode === "forgot"
                  ? "Send recovery email"
                  : "Set new password"}
        </button>

        <div className="mt-4 flex flex-col gap-1.5 text-[11px] text-muted-foreground">
          {mode !== "signin" && (
            <button
              type="button"
              onClick={() => go("signin")}
              className="text-left underline hover:text-foreground"
            >
              Already registered? Sign in
            </button>
          )}
          {mode !== "signup" && (
            <button
              type="button"
              onClick={() => go("signup")}
              className="text-left underline hover:text-foreground"
            >
              Need an account? Sign up
            </button>
          )}
          {mode === "signin" && (
            <button
              type="button"
              onClick={() => go("forgot")}
              className="text-left underline hover:text-foreground"
            >
              Forgot your password?
            </button>
          )}
        </div>
      </form>
    </Shell>
  );
}

/** Centered, responsive shell for the public auth screens. */
function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
