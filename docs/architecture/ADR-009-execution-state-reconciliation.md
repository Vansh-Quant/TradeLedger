# ADR-009 — Execution-State Reconciliation Foundation

- Status: Accepted
- Date: 2026-09-28
- Scope: Core trading domain

## Context

TradeLedger now has independent Order Lifecycle, Execution, and Account/Portfolio foundations. The system needs a deterministic seam that takes an actual Execution and reconciles both order fill state and portfolio state.

## Decision

Introduce an immutable ExecutionReconciliation state.

For each execution:

1. validate that the execution belongs to the tracked order
2. reject instrument or side mismatches
3. detect an already-applied execution ID
4. apply the execution quantity to Order lifecycle state
5. apply the actual execution to AccountPortfolio
6. record the execution ID as applied

Duplicate execution delivery is idempotent: the existing reconciliation state is returned unchanged.

## Boundaries

This foundation does not connect to brokers, discover external executions, persist reconciliation state, implement distributed locks or durable idempotency storage, calculate commissions into P&L, release buying power, perform settlement, infer missing executions, or reconcile multiple external order versions.

The in-memory applied execution ID set is a domain-level idempotency boundary, not durable infrastructure.

## Invariants

- an execution must match the tracked order ID, instrument, and side
- execution quantity cannot exceed remaining order quantity
- each execution ID is applied at most once within the reconciliation state
- successful reconciliation updates Order and AccountPortfolio together
- duplicate reconciliation does not change state
- transitions remain immutable
- actual Execution remains the source of truth for fills

## Consequences

TradeLedger now has a deterministic domain bridge from actual execution events to both order lifecycle progress and portfolio position state. Later broker adapters and durable reconciliation infrastructure can build around this contract without moving external transport concerns into the domain.