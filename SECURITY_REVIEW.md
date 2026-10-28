# TradeLedger — Security Review

**Scope:** pre-deployment hardening of the existing TradeLedger monorepo (API + workstation SPA + Supabase journal), October 2026.
**Method:** source audit of every trust boundary, implementation of fixes, unit/integration tests for each control, live smoke verification.

---

## 1. Threat model (assets)

| Asset | Sensitivity | Where it lives |
|---|---|---|
| Journaled trades (entries, screenshots, notes) | High — personal/financial | Supabase `personal_journal_entries` (RLS) or browser localStorage (local mode) |
| Trading account state, orders, executions | High | API process memory (dev), competition/research JSON on disk |
| Supabase publishable (anon) key | Public by design | Frontend bundle (`VITE_*`) |
| Supabase service-role key | Critical | **Never present in this repo** |
| Dev bearer token (`dev-token`) | Dev-only | Dev defaults, stripped from production bundles |
| Recovery/access tokens | Critical | Transient (Supabase session; never logged) |

Attacker positions considered: anonymous internet user, authenticated user A vs user B, malicious origin (browser), malicious API client, compromised dependency, log reader.

## 2. Controls implemented in this pass

### 2.1 Authentication (API)
- **Supabase JWT verification** (`packages/api/src/auth.ts`): JWKS at `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`, cached 10 min, unknown-`kid` refetch rate-limited to 1/30 s (anti-DoS), signature ES256 (JOSE raw `r||s` via `dsaEncoding: ieee-p1363`) or RS256, `iss` exact match, `aud` must contain `authenticated`, `exp`/`nbf` with 30 s skew, non-empty `sub`.
- Every failure raises an opaque `AuthenticationError` → 401 with no token echo. Covered by 8 negative tests (expired, swapped payload, wrong issuer, wrong audience, unknown kid, `alg:none`, garbage, non-bearer).
- **The dev token cannot reach production:** `loadApiConfig` throws unless `SUPABASE_URL` is set when `TRADELEDGER_ENV/NODE_ENV=production`, and `production-server.ts` forces that environment. Verified: the bundle exits 1 listing all three missing variables.
- Identity always comes from the verified `sub` claim — never from a request field.

### 2.2 Authorization
- `AccountScopedAuthorization`: an action is allowed only for accounts in `TRADELEDGER_ACCOUNT_IDS` (default `ACC-APP`); `viewer` principals get read-only actions (`order.read`, `market-data.read`, `event-stream.read`).
- Supplying another account's id in a query/body → 403 with a message that does not reveal which accounts exist.
- The route handler authorizes through the application service on **every** endpoint (existing pattern, preserved); `/health` and `/ready` remain the only unauthenticated routes and expose `{status}` only.

### 2.3 Frontend session & routing
- One `AuthProvider` (session restore, refresh, `onAuthStateChange`, expiry flag). Route gate at the root:
  - public: `/` (entry boundary) and `/auth`;
  - private: everything else → session required, else redirect to `/auth?mode=signin&redirect=<path>`;
  - production build without Supabase config → hard stop screen (no silent open workstation).
- **Open-redirect defense:** `sanitizeRedirect` allows only same-origin absolute paths; rejects `//host`, `/\host`, `\` anywhere, scheme-bearing segments, >512 chars. 10 rejection cases unit-tested.
- Login screens: `noindex`, no token/password in URLs, `autocomplete` hints, generic credential-failure copy (no account enumeration), recovery flow shows the same message whether or not the account exists (`isUserNotFound` → identical notice).
- Supabase session persistence uses supabase-js defaults (browser storage) — required for session restoration after refresh; tokens are short-lived access tokens, refresh handled by the SDK, `signOut()` clears them. Documented trade-off, §5.

### 2.4 CORS
- Explicit origin allow-list only; `*` and wildcard/path forms rejected at startup (`loadApiConfig`) and at server construction (`createHttpApi`).
- Unexpected `Origin` → immediate 403 (tested live: evil origin → 403, approved → 200).
- Preflight: `GET,POST,OPTIONS` + `authorization,content-type,idempotency-key` only, `max-age 600`.
- SSE requires an approved origin or no Origin header at all.

### 2.5 Rate limiting & abuse
- Fixed-window limiter per remote address (default 120 req/min) with **`Retry-After`** on 429; policy configurable (`RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS`); validated at startup.
- Body-size cap (32 KB default, hard ceiling 8 MB) enforced while streaming → **413 `PAYLOAD_TOO_LARGE`**; content-type must be `application/json`; `Idempotency-Key` required and validated (length + printable ASCII) for consequential mutations, replay-safe via the existing mutation fingerprint store.
- Known limitation: limiter state is per-process — correct for a single API replica; a multi-instance deployment must move it to a shared store (see §6).

### 2.6 Input validation
- Server: all bodies parsed through typed helpers (`requiredString/number`, `enumValue`, `stringArray`) with trims, finiteness checks and enum allow-lists; instrument/symbol regex `^[A-Z0-9._-]+$`; timestamps parsed and ordered (`endAt > startAt`); percent-decoding failures → 400 without parser details; history interval validated against provider capability (400 listing valid intervals).
- Client: route search schemas (zod), auth-form validation, redirect sanitization, journal numeric fields validated before persist (existing).
- SQL: Supabase access uses parameterized query builders only; no dynamic SQL anywhere in the repo.

### 2.7 Error handling & information disclosure
- Structured errors `{error:{code,message,requestId}}` for 400/401/403/404/409/413/429/500; 500 bodies are always `internal server error` (no stack/SQL/paths).
- Logs include request id, method, path (no query strings), status, duration; 500s log message + 8 stack lines **server-side only**; logger redacts `token|password|secret|authorization|cookie|api_key|service_role|bearer|private_key` keys. Redaction unit-tested.
- Security headers on every response: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `CSP: default-src 'none'; frame-ancestors 'none'`, `Cache-Control: no-store`.

### 2.8 Secrets
- No secret material in the diff: `.env*` gitignored, no service-role key anywhere, dev token lives in a DEV-guarded module (tree-shaken from production bundles by the `import.meta.env.DEV` fold, pre-existing behavior kept).
- Frontend holds only `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (public by design) and never an API secret.

## 3. Supabase / journal isolation (verified, not modified)

Migration `supabase/migrations/202610150001_personal_journal.sql`:
- `enable row level security`; `revoke all … from anon, public`; grants `select,insert,update,delete` to `authenticated` only.
- Four policies, all `using`/`with check (select auth.uid()) = owner_id` (read/insert/update/delete).
- Composite PK `(owner_id, entry_id)` → cross-user writes are impossible even with a buggy client; list query served by `personal_journal_owner_date_idx (owner_id, trade_date desc, created_at desc)`.
- Client queries always filter `.eq("owner_id", user.id)` with `user` from `auth.getUser()` — ownership never trusted from payload.

**Cross-account test status:** cannot be executed without two live Supabase accounts (blocked, see TEST_REPORT). Required E2E: user A inserts row → user B select/update/delete by A's `entry_id` returns zero rows; anonymous key → permission denied for all four operations.

## 4. Residual risks (accepted, with rationale)

| # | Risk | Severity | Mitigation / rationale |
|---|---|---|---|
| 1 | In-memory rate limiting is per-process | Medium (multi-instance only) | Single-replica deployment documented in DEPLOYMENT.md; upgrade path: shared counter (e.g. D1/KV/Redis) before scaling out. |
| 2 | In-memory trading context/order state lost on restart, not shared | Medium | Documented as non-production storage; durable adapters are the existing `feature/*-persistence` workstreams. Deployment doc instructs one API instance and warns about restart semantics. |
| 3 | Supabase session in browser storage | Low | Short-lived access tokens + SDK refresh; alternative (memory-only) would break refresh-restore. Cookies-based sessions would require server rendering changes. |
| 4 | `react-refresh` lint warnings (7) | Info | Warning-class only; standard provider/hook pattern. |
| 5 | Dev-mode gate bypass when Supabase is unconfigured | Low | Development builds only; the API still requires its own authentication for private data, and production builds hard-stop. |
| 6 | No WAF/rate-limit at the edge | Medium | Platform-level (Cloudflare etc.) recommended in DEPLOYMENT.md §Hardening; out of repo scope. |

## 5. Explicitly NOT done (requires authorization or credentials)

- No production deployment, DNS change, secret rotation, or Supabase dashboard change was performed.
- No RLS policy was altered (current policies reviewed and correct).
- No user data exported, migrated or deleted.

## 6. Next security actions (ordered)

1. Configure Supabase auth settings (email confirmations, recovery expiry, single-use OTP) — DEPLOYMENT.md §3.
2. Run the two-account RLS isolation E2E (TEST_REPORT §Blocked) once test accounts exist.
3. Before multiple API replicas: externalize rate limiting; add durable order/trading state.
4. Add edge rate limiting + HTTPS redirect on the chosen host (documented per provider).
5. Rotate any token that was ever committed historically (none found in this diff; `git log --all -S "service_role"` recommended as a one-off repo-wide scan before going public).