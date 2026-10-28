# TradeLedger — Rollback & Recovery

Practical recovery procedures for the application, its configuration, its local state and its Supabase data. **Nothing in this document has been executed against production.**

---

## 1. Identify the last known-good release

- Every deployable artifact comes from a git commit: record the commit SHA with each release (`git rev-parse HEAD`).
- Frontend: keep the previous `.output/` directory of the last good build (build into a fresh directory per release if your host supports it).
- API: keep the previous `dist/api/server.mjs` (it is a self-contained bundle; rolling back = serving the old file).
- Because the API reads its state from `TRADELEDGER_DATA_DIR` (format-versioned JSON, append-only logs for competition), rolling the binary back does **not** roll back data — see §3.

## 2. Application rollback (no data changes)

1. Stop the new API process (SIGTERM → clean ingestion shutdown).
2. Deploy the previous `dist/api/server.mjs` and previous frontend `.output/`.
3. Start the API with the **same environment variables** (they are part of the release; if the previous release used a different `CORS_ORIGINS`/`SUPABASE_URL`, roll the configuration back too — config lives in the host's environment settings, not in git).
4. Smoke-test: `/health`, unauthenticated 401, approved-origin 200, sign-in round trip.
5. **Never** combine a code rollback with a data rollback unless §3 says it is safe.

## 3. Database (Supabase) recovery

### 3.1 Schema changes
- Migrations are forward-applied and idempotent (`create table if not exists`, `drop policy if exists` + `create policy`). There is **no down-migration** for the journal table — do not attempt `drop` as "rollback".
- If a migration turns out wrong: write a **new forward migration** that corrects it. Reversing `enable row level security` or dropping policies is never an acceptable rollback.
- Current journal migration: `supabase/migrations/202610150001_personal_journal.sql` (table + 4 owner-scoped RLS policies + 2 indexes). Applying it on an existing install changes no rows.

### 3.2 Data recovery
- Supabase maintains point-in-time recovery on paid plans; verify it is enabled in the dashboard (**pending manual step**).
- Application-level backup for the journal (works on any plan):
  1. Export as an authenticated user through the app's own export (CSV/JSON), **or**
  2. Table export in the SQL editor: `select payload from public_personal_journal_entries where owner_id = '...'` — exports are per-owner, never shared.
- Restore: upsert exported rows back with the same `owner_id`/`entry_id` (the composite key makes restores idempotent) — the app's existing import path does exactly this.
- **Never** restore by truncating first; upsert-then-reconcile keeps concurrent writes alive.

### 3.3 Isolation guarantees
RLS cannot be "rolled back" by a client; even a broken frontend cannot read another owner's rows. If a policy must be changed, take the `pg_policies` dump first:

```sql
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where tablename = 'personal_journal_entries';
```

## 4. Local state recovery (`TRADELEDGER_DATA_DIR`)

State layout (append-only where possible):

```
.tradeledger-data/
├── events/          # competition event log (segmented)
├── audit/           # audit entries
└── research-runs/   # one JSON file per saved backtest run
```

**Backup (verified mechanism):**

```bash
npm run backup:data                      # → backups/data-<timestamp>/ + manifest.json (SHA-256 per file)
npm run backup:data -- --dest E:/backups # external destination
```

The script is read-only against the source, deletes nothing, and exits non-zero if the source is missing. A backup is only "verified" when `manifest.json` checksums match a re-read of the copy — re-run the script and compare manifests after any suspect restore.

**Restore:**

1. Stop the API (so files are not written mid-restore).
2. Copy the backup directory back over `TRADELEDGER_DATA_DIR` (keep the damaged directory as `*.broken-<date>` for forensics — do not delete first).
3. Start the API and confirm research runs/competition state load; if a JSON file is rejected (`research run payload is invalid`), move only that file aside — the store isolates per-file decode failures.

**Data-integrity rules:** files keep their ids, timestamps and schema version; never hand-edit JSON while the API is running; encoding is UTF-8 end-to-end.

## 5. Monitoring, alerting and incident response

Logging: JSON lines on stdout (`ts`, `level`, `service`, `event`, `requestId`, …) with secret redaction. Ship them to the host's log drain (**integration pending — no provider configured**).

Suggested alert thresholds (wire these into the drain you choose):

| Signal | Query (conceptually) | Alert when |
|---|---|---|
| API error rate | `level=error` or `http.request status>=500` | > 1% of requests over 5 min |
| Latency | `http.request durationMs` | p95 > 1 s over 5 min |
| Auth failures | `status=401/403` bursts | > 30/min from one IP (possible attack) |
| Rate limiting | `http.rate_limited` | sustained (app unusable or scanner) |
| Market data staleness | `GET /api/v1/market-data/status` → `ingestion.lastSuccessAt` | older than 5 × poll interval |
| Process | `/health` unreachable | 2 consecutive checks |
| Backup | `backup:data` job exit code | non-zero, or no new backup in 24 h |

**Incident runbook:**
1. Preserve evidence: capture logs + `x-request-id` of failing requests before restarting anything.
2. Prefer rollback of the binary/config (§2) over data changes.
3. If data is suspected corrupted: stop writes, take a forensic copy (§4), then restore from the newest verified backup.
4. Rotate any exposed credential only with explicit authorization; record the rotation time.
5. After recovery: verify §2 smoke tests **and** the auth E2E checklist (DEPLOYMENT §6) before declaring the incident closed.

## 6. Market-data outage behavior

- BiQuote polling failures are logged (`ingestion.*`), never fabricated: charts show the provider/error state and freshness, market-data status reports `healthy:false`.
- No action required beyond monitoring; when the provider recovers, the poller resumes automatically. If the process was stopped, restarting the API restarts polling for `TRADELEDGER_MARKET_DATA_INSTRUMENTS`.

## 7. What is explicitly out of scope here

- No production deploy, DNS change, secret rotation, or destructive database command has been performed.
- Full disaster recovery for the Supabase project (PITR restore, org-level export) is a dashboard/plan-level operation — verify it is enabled (**pending**).