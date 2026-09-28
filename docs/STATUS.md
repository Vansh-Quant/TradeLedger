# TradeLedger Status

**Last updated:** 2026-09-28

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
- Buying power foundation
- Basic risk boundaries foundation
- Account/Portfolio integration foundation
- Order admission and risk workflow foundation
- Order lifecycle foundation
- Execution-state reconciliation foundation
- Execution event store and deterministic replay foundation
- Domain test coverage for the completed components

## Validation

Latest user-reported local validation on 2026-09-14:

- TypeScript typecheck: passing
- Vitest: **6 test files passing**
- Tests: **48/48 passing**
- Execution tests: **8/8 passing**

Account and Cash foundations were promoted to `main`. Buying Power foundation was promoted to `main` after local validation of 69/69 tests.

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
- Leverage, margin, financing, multi-currency cash, settlement, broker reconciliation, and account/portfolio wiring remain deferred.
- See `docs/architecture/ADR-003-account-and-cash-foundation.md` for the accepted boundary.

## Basic Risk Boundaries Decision

- `RiskLimits` defines immutable hard boundaries for order notional, position notional, gross exposure, absolute net exposure, and daily loss.
- Risk checks return deterministic allowed/rejected results.
- Broker-specific margin, leverage, advanced risk models, and automatic order admission remain outside this foundation.
- See `docs/architecture/ADR-005-basic-risk-boundaries.md` for the accepted boundary.

## Account and Portfolio Integration Decision

- `AccountPortfolio` binds account identity to portfolio state without turning `Account` into a catch-all financial aggregate.
- Actual `Execution` records drive position and portfolio updates.
- Buying power, risk admission, cash settlement, and broker concerns remain separate.
- See `docs/architecture/ADR-006-account-portfolio-integration.md` for the accepted boundary.

## Order Admission and Risk Workflow Decision

- `admitOrder()` composes Order intent, deterministic RiskLimits, and BuyingPower capacity.
- Risk boundaries are checked before buying power is reserved.
- Rejected admission leaves buying-power state unchanged.
- Order lifecycle, broker submission, margin/leverage, settlement, and execution remain separate concerns.
- See `docs/architecture/ADR-007-order-admission-risk-workflow.md` for the accepted boundary.

## Order Lifecycle Decision

- Order lifecycle states are explicit and immutable.
- `filledQuantity` tracks actual quantity applied to an order and cannot exceed ordered quantity.
- Partial and complete fills update lifecycle state deterministically.
- Cancellation requests remain distinct from cancellation completion.
- Broker transport, external reconciliation, buying-power release, and execution pricing remain outside this domain foundation.
- See `docs/architecture/ADR-008-order-lifecycle-foundation.md` for the accepted boundary.

## Execution-State Reconciliation Decision

- `ExecutionReconciliation` bridges actual executions into Order fill state and AccountPortfolio position state.
- Execution IDs are applied at most once within the reconciliation state.
- Duplicate execution delivery is idempotent.
- Broker transport, durable idempotency, settlement, and external reconciliation infrastructure remain separate concerns.
- See `docs/architecture/ADR-009-execution-state-reconciliation.md` for the accepted boundary.

## Execution Event Store and Replay Decision

- Execution history now has an explicit append-oriented event-store contract.
- Execution IDs are the idempotency identity for recorded execution events.
- A deterministic in-memory store provides the reference implementation for local development and tests.
- Replay rebuilds order and portfolio state through the canonical execution reconciliation workflow.
- Processing records a successfully reconciled execution and rejects invalid executions before recording them.
- Database persistence, transactional durability, crash recovery, schema evolution, retention, and external broker reconciliation remain deferred.
- See `docs/architecture/ADR-010-execution-event-store-and-replay.md` for the accepted boundary.

## Next

- Durable execution/reconciliation infrastructure

## Guiding Principle

Build the foundation before adding trading complexity. Every subsystem should have a clear contract, deterministic behavior where required, tests, observability, and a defined failure model.
