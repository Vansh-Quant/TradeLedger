# Hosted Journal Production Verification Checklist

This checklist records evidence needed before describing the hosted journal as production-ready. Passing a UI smoke test is not proof of database authorization.

## A. Configuration and secrets

- [ ] Confirm VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are configured in the actual deployment environment.
- [ ] Confirm the browser key is a publishable/anon key, never service_role or a secret key.
- [ ] Confirm local .env.local files are ignored by Git and are not present in commits or build artifacts.
- [ ] Confirm production and preview URLs are configured in Supabase Auth URL settings.
- [ ] Confirm no credentials are written to console logs, screenshots, issue reports, or client error messages.

## B. Authentication lifecycle

Using a clean browser profile:
- [ ] Signed-out visit to /journal displays sign-in.
- [ ] Invalid credentials fail without exposing account details.
- [ ] Valid credentials sign in and load only that user's journal.
- [ ] Refresh preserves a valid session as configured.
- [ ] Sign-out removes the active session and returns to sign-in.
- [ ] A signed-out user cannot create, update, delete, or load hosted journal records through the UI.

## C. Direct Row Level Security verification

Use two separate test accounts, A and B, with unmistakably different test entries. Do not use real journal entries for destructive tests.

- [ ] In Supabase SQL Editor, verify personal_journal_entries exists and relrowsecurity is enabled for the table.
- [ ] Verify grants and policies match supabase/migrations/202610150001_personal_journal.sql.
- [ ] With authenticated client sessions for A and B, confirm A can select/insert/update/delete only rows whose owner_id is A's user UUID, and B can only access B's rows.
- [ ] Attempt to submit an entry with owner_id set to the other user's UUID; the operation must be rejected or constrained by RLS.
- [ ] Confirm unauthenticated/anon requests cannot select or mutate journal records.
- [ ] Verify no service-role key is used by the browser or ordinary client requests.
- [ ] Keep test evidence that does not contain real trade data or session tokens.

A dashboard table view or a hidden UI row is insufficient evidence by itself. Use authenticated requests or automated integration tests that exercise RLS.

## D. Journal correctness and durability

- [ ] Create a test entry, refresh, sign out/in, and confirm it persists.
- [ ] Edit and delete a test entry; verify expected persistence.
- [ ] Confirm P&L totals match the included closed/open trade set and documented metric definition.
- [ ] Import a duplicate-ID backup and confirm the documented conflict behavior.
- [ ] Export JSON and CSV and confirm records can be parsed and sensitive values are not leaked.
- [ ] Verify browser-local entries remain separate until explicit import.
- [ ] Test network/database failures and confirm the UI reports failure rather than falsely claiming a save succeeded.

## E. Deployment

- [ ] Review the dependency audit.
- [ ] Run the repository check command successfully.
- [ ] Run the workstation production build successfully.
- [ ] Verify actual hosting adapter, environment variables, build output, and runtime health.
- [ ] Verify production sign-in, sign-out, redirect URLs, refresh persistence, and cross-user isolation.
- [ ] Confirm monitoring, backups, retention, recovery, and incident-response procedures.

## Release decision

Do not call the hosted journal production-ready until all critical checks above have evidence. Record the date, environment, tester, and result for each check. Rotate any credential that has accidentally been committed or exposed.
