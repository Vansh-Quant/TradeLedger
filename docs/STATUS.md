# TradeLedger Status

**Last updated:** 2026-09-14

## Current Milestone

`v0.1-foundation`

## Completed

- Repository and architecture foundation
- Security and Git workflow documentation
- Development workflow documentation
- Instrument domain model
- Trading specification domain model
- Order domain model
- Position domain model
- Portfolio aggregate foundation
- Execution domain foundation
- Domain test coverage for the completed components

## Validation

Latest local validation on 2026-09-14:

- TypeScript typecheck: passing
- Vitest: **6 test files passing**
- Tests: **48/48 passing**
- Execution tests: **8/8 passing**

## Execution Domain Decision

- `Execution` records an immutable actual fill associated with an `Order`.
- One order may produce zero, one, or many executions.
- Position changes are based on actual executions, not requested order quantity.
- Broker connectivity, reconciliation, richer fee modeling, settlement, and execution-quality analytics remain outside this initial domain foundation.
- See `docs/architecture/ADR-002-execution-domain-foundation.md` for the accepted boundary and deferred work.

## Next

- Account domain foundation
- Cash and equity model
- Buying power foundation
- Basic risk boundaries
- Account/Portfolio integration

## Guiding Principle

Build the foundation before adding trading complexity. Every subsystem should have a clear contract, deterministic behavior where required, tests, observability, and a defined failure model.
