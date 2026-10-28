# TradeLedger — Pre-Deployment Hardening Implementation Report

**Date:** 2026-10-28
**Starting point:** `main` @ `2494343788244df1f6688104b4891fc46c0a89de` (one pre-existing dirty file: `routeTree.gen.ts`, a generated artifact)
**Deliverable branch:** see "Git delivery" at the end of this file (a dedicated feature branch; `main` was not pushed to)

---

## 1. What was audited

| Area | Finding |
|---|---|
| API authentication | Static dev bearer token only (`dev-token`). No production-grade identity verification. |
| API authorization | `AllowListedAuthorization` keyed by principal id; principal came from whatever authenticator was wired. |
| API configuration | Port/CORS hardcoded in `dev-server.ts`; no startup validation; no production mode. |
| Logging | No request logs, no error logs, no correlation ids in output. |
| Frontend auth | None. Supabase sign-in existed **only** embedded in the Journal page; no route protection. |
| Frontend routes | `/` was the private dashboard; no public/private boundary for the future landing page. |
| Supabase RLS | Already correct: RLS enabled, per-owner policies, `anon` revoked, composite list index + GIN payload index (migration `202610150001_personal_journal.sql`). Verified, not modified. |
| Backend startup | Required an untracked `.tmp/dev-server.mjs`; no committed scripts or pinned runtime. |
| SEO | `robots.txt` allowed everything (`Allow: /` for all crawlers) — private routes were indexable. No sitemap. |
| Dependency audit | 1 high-severity advisory: `zod <4.6.6` (GHSA-mrhx-c7xc-m3w5). |
| Lint | Failing on this platform: 12,469 problems (12,460 CRLF/prettier, 2 real errors, 7 warnings). |

Baseline (recorded before any edit): `npm run check` → **exit 0** (typecheck, 445 core tests, workstation suite).

## 2. Root causes addressed

1. **No server-side identity verification** → the API now verifies Supabase-issued JWTs against the project's published JWKS (`packages/api/src/auth.ts`, `node:crypto` only, no new runtime dependency).
2. **Client-supplied `accountId` carried authorization weight** → new `AccountScopedAuthorization` rejects any account outside the deployment's configured account list, and restricts `viewer` principals to read actions (`packages/api/src/authorization.ts`).
3. **No production configuration discipline** → `loadApiConfig` fails fast in production unless `SUPABASE_URL`, `API_HOST` and explicit `CORS_ORIGINS` are set; the static dev token can never become a production credential (`packages/api/src/config.ts`, `packages/api/src/production-server.ts`).
4. **No session/route protection in the SPA** → shared `AuthProvider`, a single auth gate at the root route, and one `/auth` screen (sign-in / sign-up / recovery / reset) with validated post-login redirects.
5. **Backend not reproducible from a fresh clone** → `tsx` + `esbuild` pinned in the lockfile; committed `api:dev` / `api:start` / `api:build` scripts; `.tmp/dev-server.mjs` no longer required (kept only as an optional local shortcut).

## 3. Changes by file

### Backend (`packages/api`)

| File | Change |
|---|---|
| `src/config.ts` *(new)* | Environment-driven config with validation: environment, host/port, explicit CORS origins (no wildcards/paths), rate limit, body limit, auth mode, log level. `ConfigurationError` lists every problem at startup. |
| `src/auth.ts` *(new)* | `supabaseJwtAuthenticator`: JWKS fetch + cache/refresh, ES256 (IEEE-P1363) and RS256 verification, `iss`/`aud`/`exp`/`nbf` checks with 30 s skew, identity from verified `sub`. All failures are opaque `AuthenticationError`. |
| `src/authorization.ts` *(new)* | `AccountScopedAuthorization`: configured-account allow-list + read-only role restriction. Foreign account ids → 403 without revealing which accounts exist. |
| `src/logging.ts` *(new)* | JSON-lines logger with key-based redaction (`token`, `password`, `authorization`, `secret`, `key`, `service_role`, …), level filtering, `noopLogger` default. |
| `src/main.ts` *(new)* | Config-driven bootstrap shared by dev and production entries: application wiring, BiQuote polling, durable research/competition stores, auth strategy selection, structured startup/shutdown logs, SIGINT/SIGTERM cleanup (stops ingestion before close). |
| `src/production-server.ts` *(new)* | Production entry; forces `TRADELEDGER_ENV=production` → refuses to start without Supabase JWT config. |
| `src/dev-server.ts` | Now a thin dev entry over `main.ts` (same defaults as before: loopback, `dev-token`, `.tradeledger-data`). |
| `src/server.ts` | Request logging (status, duration, request id; `/health`+`/ready` at debug), 500s log internal message + truncated stack, `Retry-After: 60` on 429, oversized bodies → **413 `PAYLOAD_TOO_LARGE`** (was 400), error bodies now carry `error.requestId` for correlation. |
| `src/errors.ts` | Added `PayloadTooLargeError` → 413 mapping. |
| `src/types.ts`, `src/index.ts` | `ApiServerOptions.logger`; export new modules. |

### Frontend (`packages/workstation-glass`)

| File | Change |
|---|---|
| `src/lib/auth-policy.ts` *(new)* | Pure policy: `PUBLIC_PATHS`, `isPublicPath`, `sanitizeRedirect` (blocks `//host`, `/\host`, scheme-bearing and >512-char values), `authGate` decision function, `friendlyAuthError` copy. |
| `src/lib/auth.tsx` *(new)* | `AuthProvider` + `useAuth`: one session listener for the app (restoration, refresh, expiry detection, sign-out), re-exporting Supabase-backed actions. |
| `src/routes/auth.tsx` *(new)* | `/auth` screen: sign-in, sign-up (with confirmation state), forgot-password (no account-existence disclosure), reset-password (waits for the recovery session; expired-link state). Labeled inputs, autocomplete hints, `role=alert`/`role=status` messages, `noindex`, responsive card. |
| `src/routes/dashboard.tsx` *(new)* | The former `/` dashboard, moved intact; now `noindex`. |
| `src/routes/index.tsx` | `/` is now the **public entry boundary**: signed-in → redirect `/dashboard`, signed-out → a minimal sign-in prompt. Marked in code as the single integration point for the future Stitch landing page. |
| `src/routes/__root.tsx` | `AuthProvider` + `RouteGate`: public paths render bare, private paths render inside `AppShell` or redirect to `/auth?mode=signin&redirect=<path>`; unconfigured **production** builds hard-stop with a notice (dev keeps working without Supabase). Root head defaults to `noindex, nofollow`; error component unchanged. |
| `src/components/terminal/AppShell.tsx` | Logo/nav now target `/dashboard`; header shows the signed-in identity + **Sign out**. |
| `src/components/terminal/nav.ts` | Dashboard path updated. |
| `src/api/client.ts` | Bearer priority: explicit configured token → active Supabase session access token → none (API answers 401). All requests still flow through this one client. |
| `src/routes/journal.tsx` | Uses the shared session instead of its own listener/form; embedded sign-in form replaced by links to `/auth` (returning to `/journal`). Journal persistence logic untouched. |
| `src/lib/journal-cloud.ts` | Added `sendPasswordResetEmail`, `updateAccountPassword`, `recoveryRedirectUrl`, `isUserNotFound`. Existing CRUD unchanged. |
| `public/robots.txt` | Now `Disallow:` every workstation route + `/api/`; crawlers allowed only on `/`; Sitemap line stamped by the generator script. |
| `.prettierrc` | `endOfLine: "auto"` — fixes 12,460 CRLF false positives on Windows checkouts (git `core.autocrlf=true`). |
| Formatting | `prettier --write` across `src/**` so `npm run lint` passes (0 errors). |

### Scripts / root

| File | Change |
|---|---|
| `package.json` | Pinned `tsx@4.20.6`, `esbuild@0.28.2` (exact, lockfile updated); new scripts `api:dev`, `api:start`, `api:build`, `build:workstation`, `backup:data`, `seo:sitemap`. |
| `scripts/backup-data.mjs` *(new)* | Read-only copy of the local state dir to `backups/data-<ts>/` with a SHA-256 manifest; never deletes, never touches Supabase. Verified against `.tradeledger-data` (2 files copied + checksummed). |
| `scripts/generate-sitemap.mjs` *(new)* | Writes `public/sitemap.xml` for **public routes only** and stamps `Sitemap:` into `robots.txt`; refuses to run without an absolute site URL. |
| `zod` | `3.25.76 → 4.6.7` (security fix GHSA-mrhx-c7xc-m3w5). Only `z.object/z.string/z.enum/.optional()` are used (route search schemas) — API-identical in v4; typecheck, 107 tests and the production build all pass on v4. |

### Tests added / updated

- `tests/api/security-hardening.test.ts` *(new, 20 tests)*: config validation (production fail-fast, wildcard CORS, bad ports/limits), JWT auth (valid, expired, swapped payload, wrong issuer/audience, unknown kid, `alg:none`, non-bearer), account-scoped authorization + viewer restriction, logger redaction/levels, 401 correlation id.
- `tests/api/http-api.test.ts`: oversized body now asserts 413 + `PAYLOAD_TOO_LARGE` + matching `requestId`; rate-limit test asserts `Retry-After` and `RATE_LIMITED` (contract updated per §11 of the mission).
- `packages/workstation-glass/src/test/auth-policy.test.ts` *(new, 14 tests)*: public paths, open-redirect rejection set, gate decisions (redirect/loading/render/blocked), friendly error copy incl. no-token-leakage.

## 4. Verification (exact commands and results)

See `TEST_REPORT.md` for the full command log. Summary:

| Gate | Result |
|---|---|
| `npm run check` (typecheck + 64 core test files + 14 workstation test files) | **exit 0 — 465 + 107 tests passed** |
| `npm run lint --workspace packages/workstation-glass` | **exit 0** — 0 errors, 7 warnings (all `react-refresh/only-export-components`, pre-existing pattern) |
| `npm run build --workspace packages/workstation-glass` (production SSR build) | **exit 0** |
| `npm run api:build` (esbuild bundle) | **exit 0** → `dist/api/server.mjs` (217 KB) |
| Bundle without env | exits 1 with the three required-variable errors (fail-fast verified) |
| Bundle with production env (port 3100) | starts, `/health` 200, unauthenticated API → 401, structured logs emitted |
| `npm audit` / `npm audit --omit=dev` | **0 vulnerabilities** |
| Live dev smoke (see §5) | passed |

## 5. Live application (local)

- **Frontend:** http://localhost:4173 (`npm run dev --workspace packages/workstation-glass`)
- **Backend:** http://127.0.0.1:3000 (`npx tsx packages/api/src/dev-server.ts` ≡ `npm run api:dev`)
- Verified in a real browser: `/` boundary, protected `/dashboard` → redirect to `/auth?mode=signin&redirect=%2Fdashboard`, sign-in/sign-up screens, failed-sign-in error state, dev continue-through, 404 screen, API `CONNECTED` pill, console error-free, no horizontal overflow at 390 px.
- Backend verified with `curl`: `/health` 200, `/ready` 200, approved origin 200 / foreign origin 403, unauthenticated API 401, authenticated dev token 200.

## 6. Honest limitations / blockers

1. **Real Supabase sign-up/sign-in/recovery cannot be exercised here** — no Supabase project credentials exist in this environment (no `.env` present). The full auth code path was verified against a stub project: UI, gate redirects, error states, session wiring, token attachment. The E2E checklist for a real project is in `TEST_REPORT.md` §"Blocked checks".
2. **Supabase dashboard settings** (email verification, recovery-link expiry, OTP single-use) must be configured manually — documented in `DEPLOYMENT.md`; *not* claimed as changed.
3. **In-memory stores** (`TradingApplicationService` context, order-state, market-data state) are single-process and reset on restart — see `SECURITY_REVIEW.md` §Persistence and §Deployment for the multi-instance guidance (one API replica until durable adapters exist).
4. **Landing page intentionally not designed** — `/` is a routing boundary only, with an integration comment.
5. **Lint warnings (7)** remain: `react-refresh/only-export-components` on shadcn UI files and `lib/auth.tsx` (provider+hook co-located). Pre-existing pattern; errors are zero.

## 7. Data safety

- No journal record, `.tradeledger-data` file, Supabase table/policy, or competition/research state was modified, deleted or migrated. The backup script only **reads** the state directory.
- `supabase/migrations/202610150001_personal_journal.sql` unchanged; RLS verified by inspection (policies owner-scoped, `anon` revoked, indexes intact).
- No secrets committed: no `.env` in the tree or in the diff (a temporary stub `.env` used for UI verification was deleted before committing).
- Tests do not touch Supabase or `.tradeledger-data` (the new API tests use in-memory adapters; the backup-script check writes only into gitignored `.tmp/`).

## 8. Git delivery

See the final section of the mission report for branch name, commit SHA and pull instructions (branch: dedicated feature branch created from `main`; no force-push, no branch deletion, nothing pushed to `main`).
