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

## Security

TradeLedger will handle highly sensitive trading and research information. Secrets, broker credentials, API keys, private certificates, personal trading history, and production credentials must never be committed to Git.

See [`SECURITY.md`](SECURITY.md) for reporting and security expectations.

## Documentation

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — system architecture and engineering principles
- [`ROADMAP.md`](ROADMAP.md) — planned development sequence
- `docs/architecture/` — architecture decision records
- `docs/specs/` — subsystem specifications

## License

The project is currently private and unlicensed. A public licensing decision will be made only if and when components are intentionally open-sourced.
