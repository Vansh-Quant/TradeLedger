# ADR-007 — Order Admission and Risk Workflow

- Status: Accepted
- Date: 2026-09-27
- Scope: Core trading domain

## Context

TradeLedger now has Order intent, Buying Power capacity, and deterministic Risk
Boundaries. The system needs a single pre-admission seam that composes those
contracts without turning Order into a risk engine or broker adapter.

## Decision

Introduce an order-admission workflow.

The caller supplies the applicable order notional and projected account metrics.
The workflow checks order notional, projected position notional, projected gross
exposure, projected absolute net exposure, daily loss, and available buying
power. Buying power is reserved only when every check passes.

A rejected order does not consume buying power.

## Boundaries

This workflow does not:

- change Order.status
- submit orders to brokers
- calculate market/reference prices
- calculate leverage or margin
- derive projected exposure itself
- perform settlement
- handle fills or executions
- implement cancellation/release lifecycle

## Invariants

- all risk checks pass before buying power is reserved
- rejection leaves buying-power state unchanged
- successful admission increases reserved capacity by exactly the order notional
- Order remains immutable and in its existing lifecycle state
- the workflow is deterministic for the supplied inputs

## Consequences

TradeLedger now has an explicit pre-trade gate connecting Order intent,
risk boundaries, and buying-power capacity while preserving deterministic
domain boundaries.
