# ADR-019: Domain Hardening for Accounting, OMS, and Risk

- Status: Accepted
- Date: 2026-10-03

## Context

TradeLedger added an accounting ledger, OMS workflow, and centralized risk engine on top of the existing deterministic trading core.

The new modules must not become competing sources of truth for cash, P&L, order lifecycle, execution reconciliation, position state, or buying-power reservation.

## Decision

### Accounting

- Cash operations delegate to the canonical Cash domain.
- Realized and unrealized P&L are signed values.
- Equity is settled cash plus current unrealized P&L.
- Ledger transactions require explicit valid timestamps.
- Accounting state remains immutable.
- Cash reservations cannot exceed currently unreserved cash.
- Ledger entries cannot contain both debit and credit.

### Risk

- Risk evaluation remains deterministic.
- Net exposure is signed and evaluated by absolute magnitude.
- Risk policies are account-scoped.
- Draft, paused, retired, and disabled policies do not admit orders.
- Buying-power availability is checked after configured risk limits.

### OMS

- OMS is an orchestration boundary.
- Canonical TradingCoreWorkflow remains the source of truth for admission, execution processing, buying-power reservation lifecycle, and cancellation settlement.
- Canonical OrderLifecycle remains the source of truth for order state transitions.
- Canonical ExecutionReconciliation remains the source of truth for applying executions to orders and account portfolios.
- OMS does not implement an independent position or portfolio accounting engine.
- Duplicate execution processing remains idempotent.

## Consequences

- Application/API layers can depend on stable orchestration boundaries without duplicating financial logic.
- Domain behavior is easier to test independently.
- Future broker adapters can remain outside deterministic accounting and risk rules.
- More advanced margin, financing, multi-currency settlement, and portfolio risk remain deferred.

## Validation

New domain tests cover accounting, risk, and OMS invariants. Local npm run check validation remains the final promotion gate for this feature branch.
