# ADR-001: Repository and Architecture Foundation

- **Status:** Accepted
- **Date:** 2026-09-04

## Context

TradeLedger is intended to grow from a personal trading terminal into a complete trading, quantitative research, automation, and AI orchestration platform. The project therefore needs stable boundaries before substantial implementation begins.

## Decision

TradeLedger will begin as a private monorepo. The repository will separate applications, deterministic core/domain services, execution, backtesting, research, strategies, agents, infrastructure, shared packages, tests, and documentation.

The initial Git workflow is:

- `main` — stable/production-ready history
- `develop` — integration branch
- `feature/*` — focused subsystem work
- `fix/*` — focused corrections
- `docs/*` — documentation-only changes when useful

Major milestones will be tagged. Significant architecture changes will be recorded as ADRs.

## Consequences

This gives the project one source tree and unified CI while preserving subsystem boundaries. The repository can later be split into public or specialized repositories if there is a concrete reason to do so.

GitHub remains the source-control and engineering collaboration layer. Large market datasets, private trading records, model checkpoints, and operational data belong in dedicated storage rather than Git.
