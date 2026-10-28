import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase-client";
import { decodeJournalEntries, type JournalEntry } from "@/lib/journal-store";

type JournalRow = {
  owner_id: string;
  entry_id: string;
  trade_date: string;
  symbol: string;
  setup: string;
  session: string;
  outcome: string;
  payload: JournalEntry;
  created_at: string;
  updated_at: string;
};

function requireClient() {
  if (!supabase)
    throw new Error(
      "Hosted journal is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
    );
  return supabase;
}

async function requireUser(): Promise<{ user: User; client: NonNullable<typeof supabase> }> {
  const client = requireClient();
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Sign in to access your hosted journal.");
  return { user: data.user, client };
}

function toRow(entry: JournalEntry, ownerId: string): JournalRow {
  return {
    owner_id: ownerId,
    entry_id: entry.id,
    trade_date: entry.date,
    symbol: entry.symbol,
    setup: entry.setup,
    session: entry.session,
    outcome: entry.outcome,
    payload: entry,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  };
}

export async function loadCloudJournalEntries(): Promise<JournalEntry[]> {
  const { user, client } = await requireUser();
  const { data, error } = await client
    .from("personal_journal_entries")
    .select("payload")
    .eq("owner_id", user.id)
    .order("trade_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;

  const payload = (data ?? []).map((row) => row.payload);
  const decoded = decodeJournalEntries(JSON.stringify(payload));
  if (decoded.length !== payload.length) {
    throw new Error(
      "Some hosted journal records are invalid. Export a database backup before changing them.",
    );
  }
  return decoded;
}

export async function upsertCloudJournalEntries(entries: readonly JournalEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const { user, client } = await requireUser();
  const rows = entries.map((entry) => toRow(entry, user.id));
  const { error } = await client
    .from("personal_journal_entries")
    .upsert(rows, { onConflict: "owner_id,entry_id" });
  if (error) throw error;
}

export async function deleteCloudJournalEntries(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const { user, client } = await requireUser();
  const { error } = await client
    .from("personal_journal_entries")
    .delete()
    .eq("owner_id", user.id)
    .in("entry_id", [...ids]);
  if (error) throw error;
}

export async function signInToJournal(email: string, password: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUpForJournal(
  email: string,
  password: string,
): Promise<{ confirmationRequired: boolean }> {
  const client = requireClient();
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw error;
  return { confirmationRequired: !data.session };
}

export async function signOutOfJournal(): Promise<void> {
  const client = requireClient();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

/** Where Supabase sends the user after clicking a recovery link. */
export function recoveryRedirectUrl(): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/auth?mode=reset`;
}

/** Sends a password-recovery email. Account existence is not disclosed by us. */
export async function sendPasswordResetEmail(email: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: recoveryRedirectUrl(),
  });
  if (error) throw error;
}

/** Sets a new password for the currently signed-in (recovery) session. */
export async function updateAccountPassword(password: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.auth.updateUser({ password });
  if (error) throw error;
}

/** True when Supabase reports that no account matches — used to avoid
 *  disclosing whether an address is registered. */
export function isUserNotFound(error: unknown): boolean {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return code === "user_not_found" || message.includes("user not found");
}
