# TradeLedger — Deployment Guide

This document describes reproducible local startup and the path to a secure production deployment. Nothing here has been executed against production; every external step is explicitly marked as pending.

---

## 1. Prerequisites

- **Node.js ≥ 22** (developed/tested on v22.23.2) and **npm ≥ 10**
- Git
- For production: a Supabase project (journal + authentication)
- A browser and, for the market-data provider, outbound HTTPS access to `biquote.io`

All npm dependencies (including `tsx` and `esbuild`) are pinned in `package-lock.json`; always install with `npm ci` from a clean checkout.

## 2. Local development (Windows PowerShell + Unix)

### 2.1 Install

```powershell
# PowerShell
npm ci
```

```bash
# Unix shell
npm ci
```

### 2.2 Backend API

```powershell
# PowerShell — dev entry (loopback bind, dev-token auth, JSON state in .tradeledger-data)
npm run api:dev
```

```bash
# Unix shell
npm run api:dev
```

Equivalent without the script: `npx tsx packages/api/src/dev-server.ts`.
Defaults: `http://127.0.0.1:3000`, bearer token `dev-token`, CORS origins `http://127.0.0.1:4173`, `http://localhost:4173`, `http://127.0.0.1:5173`, `http://localhost:5173`.

Environment overrides:

| Variable | Default | Meaning |
|---|---|---|
| `API_HOST` | `127.0.0.1` (dev) | bind address (required in production) |
| `API_PORT` | `3000` | listen port |
| `CORS_ORIGINS` | local dev origins | comma-separated exact origins, no wildcards (required in production) |
| `SUPABASE_URL` | — | enables Supabase JWT verification; **required in production** |
| `SUPABASE_JWT_AUDIENCE` | `authenticated` | expected `aud` claim |
| `TRADELEDGER_ENV` | `development` | `production` enables strict validation |
| `TRADELEDGER_DATA_DIR` | `.tradeledger-data` | JSON state directory (competition, research runs) |
| `TRADELEDGER_ACCOUNT_IDS` | `ACC-APP` | comma-separated account ids this deployment serves |
| `TRADELEDGER_MARKET_DATA_INSTRUMENTS` | `XAUUSD,EURUSD,USDJPY,BTCUSD` | polled symbols |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX_REQUESTS` | `60000` / `120` | per-IP fixed window |
| `API_MAX_BODY_BYTES` | `32768` | request body cap (max 8 MB) |
| `API_LOG_LEVEL` | `debug` (dev) / `info` (prod) | `debug\|info\|warn\|error` |

Health checks: `GET /health` (liveness), `GET /ready` (readiness). Both return `{"status":…}` with `x-request-id`.

### 2.3 Frontend workstation

```powershell
# PowerShell
npm run dev --workspace packages/workstation-glass
```

```bash
# Unix shell
npm run dev --workspace packages/workstation-glass
```

Opens on **http://localhost:4173** (strict port). To connect to an API on another host, create `packages/workstation-glass/.env`:

```ini
VITE_TRADELEDGER_API_URL=http://127.0.0.1:3000
VITE_TRADELEDGER_ACCOUNT_ID=ACC-APP
# dev builds default to the dev-token; production uses the Supabase session
# VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
# VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_KEY
```

`.env` is gitignored. **Never** put a service-role key in any `VITE_*` variable.

### 2.4 Verification smoke list (local)

```bash
curl http://127.0.0.1:3000/health            # {"status":"ok"}
curl http://127.0.0.1:3000/ready             # {"status":"ready"}
curl -o /dev/null -w "%{http_code}\n" \
  http://127.0.0.1:3000/api/v1/orders?accountId=ACC-APP    # 401 without token
curl -H "authorization: Bearer dev-token" -o /dev/null -w "%{http_code}\n" \
  "http://127.0.0.1:3000/api/v1/orders?accountId=ACC-APP" # 200 with token
```

Then open http://localhost:4173 — the status pill must show **CONNECTED** and the browser console must be error-free.

## 3. Supabase configuration (manual — pending, not performed by this repo)

In the Supabase dashboard (Authentication → Providers/Email, URL configuration):

1. **Site URL:** the production origin, e.g. `https://app.example.com`.
2. **Redirect URLs:** add `https://app.example.com/auth?mode=reset` (recovery callback) plus the local equivalent `http://localhost:4173/auth?mode=reset` for development.
3. **Email confirmations:** ON for production sign-ups.
4. **Password recovery:** use Supabase's default recovery-link expiry; confirm "Secure email change" settings. (This guide does not change these settings; verify them in the dashboard.)
5. Apply the journal migration (idempotent, reviewable): run `supabase/migrations/202610150001_personal_journal.sql` in the SQL editor **only if it has not been applied yet** — existing installs already have it. The migration creates the table, RLS policies and indexes; it never modifies existing rows.
6. Confirm RLS: `personal_journal_entries` must show RLS **enabled** with 4 owner-scoped policies.

## 4. Production build

```bash
# 1. Frontend (production build: nitro/Cloudflare-Workers-compatible server + assets)
npm run build --workspace packages/workstation-glass
#    → packages/workstation-glass/.output/
#      .output/server/index.mjs      Worker fetch handler
#      .output/server/wrangler.json  Worker config (nodejs_compat, ASSETS binding)
#      .output/public/               static assets

# 2. API bundle (self-contained ESM, workspace sources bundled)
npm run api:build
#    → dist/api/server.mjs

# 3. Security/SEO assets
npm run seo:sitemap -- --site https://your-domain.example   # writes public/sitemap.xml + stamps robots.txt
```

**Important:** `.output/server/index.mjs` is a Workers-style fetch handler —
it exports the app and does **not** call `listen()`, so plain
`node .output/server/index.mjs` exits immediately without serving (the
pre-existing `start:node` script is misleading for the current build preset).
Preview the production build with:

```bash
npm run preview:nitro --workspace packages/workstation-glass   # nitro/wrangler local preview
```

and deploy it to a Workers-compatible host with wrangler using
`.output/server/wrangler.json` (or a host that runs nitro's worker output).
Verify whichever provider against its current limits before relying on it —
that selection is an open task (IMPLEMENTATION_REPORT §6).

Run the API in production:

```bash
SUPABASE_URL=https://YOUR_PROJECT.supabase.co \
API_HOST=0.0.0.0 \
API_PORT=3000 \
CORS_ORIGINS=https://your-domain.example \
TRADELEDGER_DATA_DIR=/var/lib/tradeledger \
node dist/api/server.mjs
```

The process **refuses to start** without `SUPABASE_URL`, `API_HOST` and `CORS_ORIGINS` (fail-fast verified). It logs JSON lines to stdout and stops market-data ingestion cleanly on SIGINT/SIGTERM.

## 5. Hosting guidance (provider selection pending — not yet chosen)

Requirements that any host must satisfy:

- **Frontend:** a Workers-compatible runtime for the nitro output in `packages/workstation-glass/.output` (wrangler.json: `nodejs_compat`, `ASSETS` binding serving `.output/public`), HTTPS at the edge.
- **API:** a persistent Node 22 service with a writable volume for `TRADELEDGER_DATA_DIR` (competition/research JSON) and an advertised port/bind address from the environment.
- **Both:** custom domain + TLS, log drain for the JSON stdout, health-check endpoints `/health` and `/ready`.
- **Single API replica only** until rate limiting and trading state are externalized (see SECURITY_REVIEW §4 risks 1–2). Duplicate replicas would each run their own BiQuote poller and in-memory state.

Provider-specific deployment is deliberately not written here: it must be verified against the chosen provider's current limits and terms before relying on it (that verification is an open task — see IMPLEMENTATION_REPORT §6).

## 6. Post-deploy smoke test (production)

1. `GET https://api.your-domain/health` → 200 `{"status":"ok"}`.
2. Unauthenticated `GET /api/v1/orders?accountId=…` → **401** `UNAUTHORIZED`.
3. Foreign `Origin` → **403** `CORS_FORBIDDEN`; the real web origin → 200 with `access-control-allow-origin` echoed.
4. Open `https://app.your-domain/` → sign-in screen (or redirect to it).
5. **Auth E2E checklist** (requires real Supabase, see TEST_REPORT §4):
   - sign up → confirmation email → confirm → sign in;
   - reload the page → session restored (still signed in);
   - direct URL to `/dashboard` while signed out → redirected to `/auth?mode=signin&redirect=%2Fdashboard`;
   - sign out → `/` shows the public entry; API calls return 401;
   - "Forgot password" → recovery email → link opens `/auth?mode=reset` → set new password → workstation loads;
   - expired/reused recovery link → "invalid or expired" state, no session granted;
   - user B cannot read user A's journal rows (SQL check in SECURITY_REVIEW §3);
   - browser console clean; HTML/JS/CSS content types correct.
6. `curl -I https://app.your-domain/` → verify `X-Robots-Tag`/meta: private pages carry `noindex`; `robots.txt` allows only `/`.
7. Confirm logs are flowing and contain `requestId` on errors, with no tokens/secrets.

## 7. Operational variables checklist (before going live)

- [ ] `SUPABASE_URL`, `API_HOST`, `CORS_ORIGINS` set on the API service
- [ ] Frontend `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` set at build time
- [ ] `VITE_SITE_URL` set → sitemap + canonical generated
- [ ] Supabase redirect URLs include `https://<domain>/auth?mode=reset`
- [ ] HTTPS enforced; HTTP redirects to HTTPS
- [ ] `TRADELEDGER_DATA_DIR` on a persistent volume + `npm run backup:data` scheduled
- [ ] Log drain + alert thresholds (see ROLLBACK_AND_RECOVERY §5)
- [ ] Edge rate limiting recommended (in-app limiter is per-process)