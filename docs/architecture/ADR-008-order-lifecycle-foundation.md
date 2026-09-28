# ADR-008 — Order Lifecycle Foundation

- Status: Accepted
- Date: 2026-09-28
- Scope: Core trading domain

## Context

Order intent now participates in pre-trade admission, but its lifecycle still only represented creation. The domain needs explicit state transitions and fill progress without coupling order state to broker transport.

## Decision

Extend Order with lifecycle states and immutable transition operations. Lifecycle states cover created, submitted, acknowledged, partially_filled, filled, cancel_requested, cancelled, rejected, and expired.

`filledQuantity` tracks actual quantity applied to the order and cannot exceed the original order quantity.

## Boundaries

This foundation does not communicate with brokers, invent fills, calculate execution price or P&L, release buying power, reconcile external order state, or persist lifecycle events. Actual executions remain the source of fill truth.

## Invariants

- lifecycle transitions are explicit and deterministic
- terminal states cannot be transitioned further
- filled quantity starts at zero
- filled quantity never exceeds ordered quantity
- fills are accepted only from acknowledged, partially_filled, or cancel_requested state
- a complete fill produces filled status
- partial fill produces partially_filled status
- transitions return new immutable Order values

## Consequences

TradeLedger now has a deterministic order-state machine suitable for later broker adapters and execution reconciliation without embedding transport logic into the domain model.