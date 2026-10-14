# Hosted TradeLedger Journal

This adds a Supabase-backed personal journal while keeping TradeLedger's deterministic trading engine and existing workstation architecture unchanged.

## What is hosted

- Journal entries are stored in Supabase Postgres, not browser localStorage.
- Supabase Auth signs users in with email and password.
- Postgres Row Level Security (RLS) scopes every row to `auth.uid()`.
- The current journal search, filters, and analytics continue to work after loading the signed-in user's hosted entries.
- JSON/CSV export and backup import remain available.

The current v1 stores the compressed screenshot data inside the journal JSON payload. Keep screenshots modest; a later iteration can move them into a private Supabase Storage bucket.

## 1. Create a Supabase project

1. Create a project in the Supabase dashboard.
2. Open **SQL Editor** and run `supabase/migrations/202610150001_personal_journal.sql`.
3. Open **Authentication → URL Configuration** and set the Site URL to your eventual deployed frontend URL. Add the preview and production URLs to the redirect allow-list.
4. In **Authentication → Providers**, enable Email. For a private personal journal, consider disabling public sign-ups after creating your own account.

Do not use a service-role key in frontend code or in any `VITE_*` environment variable. RLS is mandatory.

## 2. Configure local development

Copy `.env.example` to `.env.local` and replace the placeholders with the Supabase project URL and publishable/anon key from **Project Settings → API**.

Install/update dependencies and lockfile from the repository root:

```bash
npm install
```

Start the workstation:

```bash
npm run dev --workspace packages/workstation-glass
```

If the Supabase variables are absent, the journal deliberately stays in local-only mode for development. With both variables set, it requires sign-in and uses the hosted database.

## 3. Deploy the workstation

Use Vercel or another host that supports the repository's TanStack Start/Vite build. Connect the GitHub repository and select branch `feat/hosted-journal-supabase` for a preview deployment first. Configure the two variables below in the host's environment settings, then redeploy:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Build command: `npm run build --workspace packages/workstation-glass`. Confirm the output directory/build preset detected by the host rather than assuming a static Vite output: this app uses TanStack Start with a server entry.

Do not deploy to production until typecheck, workstation tests, sign-in, cross-user isolation, create/edit/delete, import/export, and refresh persistence have been verified.

## 4. Import existing local entries

After signing in to the hosted journal, use **Import browser journal to cloud**. It reads this browser's existing `tradeledger:personal-journal:v1` localStorage entries and uploads them to your authenticated account. The cloud rows take precedence if an entry ID already exists. This operation is explicit; it does not silently upload browser data.

Retain your original browser data and a JSON backup until the hosted entries have been checked. Old Private Trading Desk backups can still be imported using the existing JSON import action.

## Backups and privacy

- Export JSON backups regularly, especially while using a free database tier.
- Supabase free projects may pause when inactive and do not include automatic daily database backups; verify the current plan before relying on it for important journal data.
- Do not use real broker credentials or put API secrets into journal fields.
- RLS is a security boundary: keep the migration and policy tests under version control and verify that one authenticated user cannot read or mutate another user's entries.
