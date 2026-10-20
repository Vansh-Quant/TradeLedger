-- Hosted personal journal storage. Apply with Supabase SQL Editor or Supabase CLI.
-- Every row is scoped to the authenticated owner. Never disable RLS on this table.
create table if not exists public.personal_journal_entries (
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  entry_id text not null,
  trade_date date not null,
  symbol text not null check (char_length(symbol) between 1 and 32),
  setup text not null default '',
  session text not null default '',
  outcome text not null check (outcome in ('WIN', 'LOSS', 'BREAKEVEN', 'OPEN')),
  payload jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (owner_id, entry_id)
);

create index if not exists personal_journal_owner_date_idx
  on public.personal_journal_entries (owner_id, trade_date desc, created_at desc);
create index if not exists personal_journal_payload_gin_idx
  on public.personal_journal_entries using gin (payload jsonb_path_ops);

alter table public.personal_journal_entries enable row level security;

revoke all on public.personal_journal_entries from anon, public;
grant select, insert, update, delete on public.personal_journal_entries to authenticated;

drop policy if exists "Users can read their own journal" on public.personal_journal_entries;
create policy "Users can read their own journal"
  on public.personal_journal_entries for select
  to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "Users can insert their own journal" on public.personal_journal_entries;
create policy "Users can insert their own journal"
  on public.personal_journal_entries for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists "Users can update their own journal" on public.personal_journal_entries;
create policy "Users can update their own journal"
  on public.personal_journal_entries for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "Users can delete their own journal" on public.personal_journal_entries;
create policy "Users can delete their own journal"
  on public.personal_journal_entries for delete
  to authenticated
  using ((select auth.uid()) = owner_id);
