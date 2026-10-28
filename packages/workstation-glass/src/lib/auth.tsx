import type { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { isHostedJournalConfigured, supabase } from "@/lib/supabase-client";
import {
  sendPasswordResetEmail,
  signInToJournal,
  signOutOfJournal,
  signUpForJournal,
  updateAccountPassword,
} from "@/lib/journal-cloud";

/**
 * Application-wide Supabase session state.
 *
 * One session listener for the whole app (the journal page included), so
 * sign-in, sign-out and expiry propagate everywhere consistently. Session
 * persistence, refresh and URL-code exchange are handled by supabase-js
 * (`persistSession` / `detectSessionInUrl` in `supabase-client.ts`).
 */
export interface AuthContextValue {
  /** True once the initial session lookup has resolved (always true when unconfigured). */
  readonly ready: boolean;
  /** True when Supabase environment variables are present. */
  readonly configured: boolean;
  readonly session: Session | null;
  readonly user: User | null;
  /** True when a session ended without an explicit sign-out (expiry/revocation). */
  readonly expired: boolean;
  clearExpired(): void;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<{ confirmationRequired: boolean }>;
  signOut(): Promise<void>;
  resetPassword(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isHostedJournalConfigured;
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!configured);
  const [expired, setExpired] = useState(false);
  const hadSession = useRef(false);
  const signOutInitiated = useRef(false);

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session ?? null);
        if (data.session) hadSession.current = true;
        setReady(true);
      })
      .catch(() => {
        if (active) setReady(true);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next);
      setReady(true);
      if (next) {
        hadSession.current = true;
        setExpired(false);
      } else if (hadSession.current) {
        hadSession.current = false;
        if (!signOutInitiated.current) setExpired(true);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!configured) throw new Error("Hosted sign-in is not configured for this build.");
      setExpired(false);
      await signInToJournal(email, password);
    },
    [configured],
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      if (!configured) throw new Error("Hosted sign-in is not configured for this build.");
      return signUpForJournal(email, password);
    },
    [configured],
  );

  const signOut = useCallback(async () => {
    if (!supabase) return;
    signOutInitiated.current = true;
    try {
      await signOutOfJournal();
      hadSession.current = false;
      setExpired(false);
    } finally {
      signOutInitiated.current = false;
    }
  }, []);

  const resetPassword = useCallback(
    async (email: string) => {
      if (!configured) throw new Error("Hosted sign-in is not configured for this build.");
      await sendPasswordResetEmail(email);
    },
    [configured],
  );

  const updatePassword = useCallback(
    async (password: string) => {
      if (!configured) throw new Error("Hosted sign-in is not configured for this build.");
      await updateAccountPassword(password);
    },
    [configured],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      configured,
      session,
      user: session?.user ?? null,
      expired,
      clearExpired: () => setExpired(false),
      signIn,
      signUp,
      signOut,
      resetPassword,
      updatePassword,
    }),
    [ready, configured, session, expired, signIn, signUp, signOut, resetPassword, updatePassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}
