# ADR-013: Deterministic Trading Core Workflow

## Status

Accepted

## Context

TradeLedger has deterministic foundations for order admission, buying power, order lifecycle, execution processing, and execution reconciliation. These capabilities need a narrow composition boundary so callers do not manually coordinate domain transitions in inconsistent ways.

## Decision

Add `admitTradingOrder()` and `processTradingExecution()` as the first trading-core composition boundary.

Admission composes the existing risk and buying-power gate, then transitions an admitted order through `submitted` and `acknowledged` states. A rejected order becomes `rejected` and retains its original buying-power state.

Execution processing delegates to the existing execution-processing and reconciliation workflow. It does not duplicate position, fill, or idempotency logic.

## Invariants

1. Risk and buying-power admission remain deterministic.
2. Rejected admission does not reserve buying power.
3. An admitted order reaches `acknowledged` before execution processing.
4. Actual executions remain the source of filled quantity and position changes.
5. Duplicate execution IDs remain idempotent.
6. The composition layer does not own broker transport or durable persistence.
7. Buying-power release/settlement remains a separate workflow until its reservation lifecycle is fully modeled.

## Deferred

- Broker/venue transport
- External order IDs and acknowledgements
- Cancellation transport and replacement
- Durable persistence transactions
- Buying-power reservation release after fill/cancel
- Market-data-driven notional and projected exposure calculation
- Portfolio-level dynamic risk

## Consequences

The trading core now has a single deterministic entry point for the current order-to-execution domain slice while preserving the existing subsystem boundaries. Future application services can call this composition boundary rather than reimplementing domain sequencing.
