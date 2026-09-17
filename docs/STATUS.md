# TradeLedger Status

**Last updated:** 2026-09-17

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
- Account domain foundation
- Cash and equity foundation
- Domain test coverage for the completed components

## Validation

Latest user-reported local validation on 2026-09-14:

- TypeScript typecheck: passing
- Vitest: **6 test files passing**
- Tests: **48/48 passing**
- Execution tests: **8/8 passing**

Account and Cash foundations have been implemented on `feature/account-cash-foundation`. Final repository validation for these new changes must be run locally before promotion.

## Execution Domain Decision

- `Execution` records an immutable actual fill associated with an `Order`.
- One order may produce zero, one, or many executions.
- Position changes are based on actual executions, not requested order quantity.
- Broker connectivity, reconciliation, richer fee modeling, settlement, and execution-quality analytics remain outside this initial domain foundation.
- See `docs/architecture/ADR-002-execution-domain-foundation.md` for the accepted boundary and deferred work.

## Account and Cash Decision

- `Account` owns identity, base currency, and lifecycle state.
- `CashBalance` owns base-currency settled cash operations.
- Equity is initially `settled cash + unrealized P&L`.
- Buying power, leverage, margin, financing, multi-currency cash, settlement, broker reconciliation, and account/portfolio wiring remain deferred.
- See `docs/architecture/ADR-003-account-and-cash-foundation.md` for the accepted boundary.

## Next

- Buying power foundation
- Basic risk boundaries
- Account/Portfolio integration

## Guiding Principle

Build the foundation before adding trading complexity. Every subsystem should have a clear contract, deterministic behavior where required, tests, observability, and a defined failure model.
