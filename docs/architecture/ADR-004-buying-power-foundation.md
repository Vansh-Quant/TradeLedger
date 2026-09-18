# ADR-004 — Buying Power Foundation

- **Status:** Accepted
- **Date:** 2026-09-18
- **Scope:** Core trading domain

## Context

TradeLedger needs an account-level capacity model before introducing detailed
risk limits, leverage, margin, and broker-specific rules. Buying power must not
be treated as a duplicate of cash or equity, and derived financial values
should avoid becoming contradictory stored state.

## Decision

Introduce BuyingPower as immutable deterministic state containing:

1. totalCapacity
2. reservedCapacity

Available buying power is derived as:

availableBuyingPower = totalCapacity - reservedCapacity

The foundation supports explicit reservation and release operations while
keeping the underlying state immutable.

## Boundaries

This foundation intentionally does not determine total capacity from:

- cash
- equity
- leverage
- margin requirements
- broker rules
- instrument rules
- account-level risk limits

Those inputs require explicit policies and contracts before being introduced.

The foundation also does not own order lifecycle state. A future order/risk
workflow may reserve or release capacity through this contract.

## Invariants

- total capacity must be finite and non-negative
- reserved capacity must be finite and non-negative
- reserved capacity cannot exceed total capacity
- reservation amounts must be positive
- reservations cannot exceed available capacity
- release amounts must be positive
- releases cannot exceed current reserved capacity
- buying-power state is immutable
- available buying power is derived, not independently stored

## Consequences

The domain now has a stable capacity primitive for later risk and order
workflows without prematurely encoding broker-specific margin or leverage
semantics. This keeps buying-power arithmetic deterministic and prevents a
stored available-balance field from becoming stale relative to reservations.
