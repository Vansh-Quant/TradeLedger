# TradeLedger

**A personal quantitative trading, research, execution, analytics, and trading operating system.**

TradeLedger is being built as a modular trading infrastructure platform for discretionary and systematic traders. It is designed to unify market data, execution, risk, journaling, analytics, backtesting, research, strategy automation, intelligence, and AI-assisted orchestration into one coherent system.

## Vision

TradeLedger is intended to become a complete personal trading and quantitative research environment:

- Trading terminal and charting
- Multi-account and portfolio management
- Centralized order, position, and risk engines
- Automated trade capture and journaling
- Deep performance and edge analytics
- Historical market-data and news research
- Manual replay and realistic backtesting
- Rule-based, visual, and code-based strategy development
- Research Lab and reproducible experiments
- Strategy registry and lifecycle management
- Automated strategy engines and portfolio allocation
- Monitoring, observability, and recovery
- AI research and trading intelligence
- JARVIS-style orchestration and voice interface
- Personal memory and long-term model development

## Core Architecture Principle

> **Deterministic engines calculate. Agents interpret. JARVIS orchestrates. The user commands.**

Financial calculations, execution state, risk limits, accounting, and backtest mechanics must remain deterministic and auditable. AI is used for interpretation, research assistance, orchestration, and higher-level decision support rather than replacing critical financial computation.

## Repository Structure

```text
TradeLedger/
├── apps/             # User-facing applications
├── core/             # Domain models and deterministic core engines
├── services/         # Backend/platform services
├── agents/           # Specialized AI agents
├── research/         # Research workflows, datasets, experiments, models
├── strategies/       # Strategy implementations and strategy metadata
├── backtesting/      # Backtest, replay, simulation, and robustness engines
├── execution/        # OMS, execution adapters, simulators, execution logic
├── infrastructure/   # Deployment, storage, networking, observability
├── packages/         # Shared libraries and SDKs
├── docs/             # Architecture, decisions, specifications, guides
├── tests/            # Cross-system and integration tests
├── scripts/          # Development and operational tooling
├── docker/           # Container definitions and local environments
└── .github/          # CI/CD, issue templates, repository automation
```

## Development Philosophy

1. Define contracts before implementations.
2. Build every subsystem so it can be tested independently.
3. Prefer vertical slices over years of isolated subsystem development.
4. Keep production code separate from exploratory research code.
5. Make experiments reproducible through versioned code, data, parameters, and execution assumptions.
6. Never commit credentials, private datasets, trading history, or large model artifacts.
7. Treat observability, failure handling, and recovery as first-class features.
8. Keep deterministic financial logic independent from AI behavior.

## Current Status

**Phase:** `v0.1-foundation`

The deterministic trading foundation and the first application-service boundary are established. The current work is moving upward from domain contracts into transport-independent application use cases before introducing HTTP/UI concerns.

## Long-Term System Layers

```text
User / Command Interface
        ↓
Applications & Trading Terminal
        ↓
JARVIS / Intelligence / Agents
        ↓
Research / Strategy / Portfolio Systems
        ↓
Backtesting / Simulation / Execution
        ↓
Risk / OMS / Positions / Accounts
        ↓
Market Data / News / Reference Data
        ↓
Event Bus / Data Core / Storage
        ↓
NAS / Cloud / Compute / Network
```

## Quick Start

Prerequisites: **Node.js ≥ 22** and **npm ≥ 10**.

```bash
npm ci                 # exact lockfile install (tsx + esbuild pinned)
```

**Backend API** (PowerShell or any Unix shell, run from the repo root):

```bash
npm run api:dev        # http://127.0.0.1:3000 — dev-token auth, JSON state in .tradeledger-data/
```

**Frontend workstation:**

```bash
npm run dev --workspace packages/workstation-glass   # http://localhost:4173
```

Verify: `curl http://127.0.0.1:3000/health` returns `{"status":"ok"}` and the
workstation status pill shows **CONNECTED**. Production startup, environment
variables and the full smoke checklist live in [`DEPLOYMENT.md`](DEPLOYMENT.md).

**Quality gates:**

```bash
npm run check        # typecheck + core + workstation test suites
npm run lint --workspace packages/workstation-glass
npm run build --workspace packages/workstation-glass
npm run api:build    # self-contained API bundle -> dist/api/server.mjs
npm audit
```

**Authentication:** the workstation is protected by Supabase Auth (`/auth`
route); set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` for hosted sign-in.
Local development works without Supabase, and the API still enforces its own
authentication on every private request. Production builds refuse to start
without `SUPABASE_URL`, `API_HOST` and `CORS_ORIGINS`.

**Backups:** `npm run backup:data` copies `.tradeledger-data/` to `backups/`
with a SHA-256 manifest (read-only against the source). See
[`ROLLBACK_AND_RECOVERY.md`](ROLLBACK_AND_RECOVERY.md).

## Security

TradeLedger will handle highly sensitive trading and research information. Secrets, broker credentials, API keys, private certificates, personal trading history, and production credentials must never be committed to Git.

See [`SECURITY.md`](SECURITY.md) for reporting and security expectations.

## Documentation

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — system architecture and engineering principles
- [`ROADMAP.md`](ROADMAP.md) — planned development sequence
- [`DEPLOYMENT.md`](DEPLOYMENT.md) — local startup, environment variables, production build and smoke tests
- [`SECURITY_REVIEW.md`](SECURITY_REVIEW.md) — threat model, controls and residual risks
- [`ROLLBACK_AND_RECOVERY.md`](ROLLBACK_AND_RECOVERY.md) — rollback, backup and incident runbook
- [`TEST_REPORT.md`](TEST_REPORT.md) — exact commands, results and blocked checks
- [`IMPLEMENTATION_REPORT.md`](IMPLEMENTATION_REPORT.md) — what changed and why
- `docs/architecture/` — architecture decision records
- `docs/specs/` — subsystem specifications

## License

The project is currently private and unlicensed. A public licensing decision will be made only if and when components are intentionally open-sourced.
