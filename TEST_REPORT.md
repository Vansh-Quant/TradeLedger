# TradeLedger — Test Report

All commands run from the repository root on Windows (Node v22.23.2, npm 10.9.8), 2026-10-28.
Exit codes captured with `PIPESTATUS` where output was piped through `tail`.

## 1. Baseline (before any change)

| Command | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run check` (typecheck + core + workstation) | **exit 0** — core: 63 files / 445 tests; workstation: 13 files / suite green |

## 2. Final gates (after all changes)

| Command | Result | Notes |
|---|---|---|
| `npm run check` | **exit 0** | typecheck (root + workstation), **core: 64 files / 465 tests passed**, **workstation: 14 files / 107 tests passed** |
| `npm run lint --workspace packages/workstation-glass` | **exit 0** | 0 errors; 7 warnings, all `react-refresh/only-export-components` (6 pre-existing shadcn files + `src/lib/auth.tsx` provider/hook) |
| `npm run build --workspace packages/workstation-glass` | **exit 0** | production TanStack Start build (SSR + client), nitro worker output |
| `npm run api:build` | **exit 0** | esbuild bundle → `dist/api/server.mjs` (217 KB) |
| `npm audit` and `npm audit --omit=dev` | **0 vulnerabilities** | after `zod 3.25.76 → 4.6.7` |
| `node scripts/backup-data.mjs --dest .tmp/backup-test` | exit 0 | 2 files copied, SHA-256 manifest written (read-only against source) |

### New/updated tests in this pass

- `tests/api/security-hardening.test.ts` — **20 passed**: configuration validation (production fail-fast triple, wildcard/path CORS rejection, invalid port/body/rate-limit values), Supabase JWT verification (valid token → `sub` identity, default roles, expired, payload swapped after signing, wrong issuer, wrong audience, unknown kid, `alg:none`, missing/malformed/non-bearer credentials), `AccountScopedAuthorization` (allowed, foreign-account 403, viewer read-only, legacy allow-list), logger (level filtering, redaction of nested secret keys), 401 error body ↔ `x-request-id` correlation.
- `packages/workstation-glass/src/test/auth-policy.test.ts` — **14 passed**: public-path set (incl. prefix-twin rejection), redirect sanitization (external URLs, protocol-relative, backslash tricks, scheme segments, oversized), gate decisions (public/loading/sign-in with destination/render/blocked-in-production/dev-fallback), friendly error copy incl. no-token leakage.
- `tests/api/http-api.test.ts` — **updated contract assertions**: oversized body → `413` + `PAYLOAD_TOO_LARGE` + matching `requestId`; rate limiting → `429` + `Retry-After: 60` + `RATE_LIMITED`.
- Existing suites untouched otherwise and all passing (regression: trading/order/risk/journal/market-data/research/backtesting/competition views and API boundary tests).

## 3. Live smoke tests (real processes, not mocks)

### Backend (`npx tsx packages/api/src/dev-server.ts`, port 3000)

| Check | Result |
|---|---|
| `GET /health` | `{"status":"ok"}` |
| `GET /ready` | `{"status":"ready"}` |
| `GET /api/v1/market-data?accountId=ACC-APP` without token | **401** |
| same with `Authorization: Bearer dev-token` | 200 `{"states":[]}` |
| `Origin: http://localhost:4173` | 200 (allowed) |
| `Origin: https://evil.example` | **403** (rejected) |
| Structured startup/request logs | JSON lines with `requestId`, `durationMs`, `errorCode`; no secret values |

### Production bundle (`node dist/api/server.mjs`)

| Check | Result |
|---|---|
| Without environment | exit 1, prints `API_HOST must be set…`, `CORS_ORIGINS must list…`, `SUPABASE_URL is required in production…` |
| With `SUPABASE_URL/API_HOST/API_PORT/CORS_ORIGINS` (port 3100) | starts: `{"environment":"production","authMode":"supabase","corsOrigins":1,…}`; `/health` 200; unauthenticated API → **401** with log entry |

### Frontend (`npm run dev --workspace packages/workstation-glass`, port 4173)

| Check | Result |
|---|---|
| `/` boundary → workstation (dev, no Supabase) | redirects to `/dashboard`, dashboard renders, `CONNECTED` pill |
| `/dashboard` with stub Supabase config, signed out | redirected to `/auth?mode=signin&redirect=%2Fdashboard` (destination preserved) |
| Sign-in screen | labeled email/password inputs, autocomplete attributes, `noindex` |
| Failed sign-in (unreachable stub project) | `role="alert"`: "Could not reach the sign-in service. Check your connection and try again."; button re-enabled |
| Mode switch sign-in → sign-up | URL `/auth?mode=signup&redirect=%2Fdashboard` (redirect preserved); `minlength=8`, `autocomplete=new-password` |
| Unknown route `/does-not-exist` | 404 screen inside shell with "Go home" |
| Console / network | no errors; `/health`, `/ready`, context, orders all 200 |
| Responsive 390×844 (dashboard & auth) | `scrollWidth === clientWidth` — no horizontal overflow |
| Unconfigured production build | route gate renders the hard-stop notice (unit-tested via `authGate`) |

## 4. Blocked checks (external dependencies — not claimed as passing)

1. **Real Supabase E2E (sign-up → confirm → sign-in → refresh restore → recovery link → reset → sign-out):** blocked — no Supabase project credentials exist in this environment (`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` unset; no `.env` in repo). A temporary stub was used only to verify UI/gate wiring and was deleted before committing.
   *Next action:* create `.env` in `packages/workstation-glass` with real publishable values, run the checklist in `DEPLOYMENT.md` §6.
2. **Two-account RLS isolation test:** blocked on test accounts (needs two users + SQL access). Script to run: SECURITY_REVIEW §3.
3. **Email verification / recovery-expiry behavior:** blocked on Supabase dashboard access; dashboard settings documented, not changed.
4. **Load tests (`npm run test:competition-load` etc.):** intentionally not re-run — unrelated to this change's surface (core suite includes the deterministic competition tests; full load suite available via `npm run test:competition`).

## 5. How to reproduce everything

```bash
npm ci                    # exact lockfile (tsx + esbuild pinned, zod 4.6.7)
npm run check             # typecheck + 465 core + 107 workstation tests
npm run lint --workspace packages/workstation-glass
npm run build --workspace packages/workstation-glass
npm run api:build
npm audit
```