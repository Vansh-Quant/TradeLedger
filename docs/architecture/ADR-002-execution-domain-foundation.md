# ADR-002 — Execution Domain Foundation

- **Status:** Accepted
- **Date:** 2026-09-14
- **Scope:** Core trading domain

## Context

TradeLedger must distinguish trading intent from the fills that actually occur. An order can be unfilled, partially filled, or filled by multiple market executions. Position state must therefore be derived from actual executions rather than from requested order quantity.

## Decision

Introduce `Execution` as an immutable core-domain record representing one actual fill.

The initial canonical fields are:

- execution ID
- order ID
- instrument ID
- side
- executed quantity
- execution price
- execution timestamp
- commission

The domain relationship is:

```text
Order (intent)
    |
    +---- Execution 1
    +---- Execution 2
    +---- Execution N
             |
             v
          Position
```

One order may therefore produce zero, one, or many executions.

## Invariants

An execution must have:

- non-empty identity and relationship identifiers
- a valid buy/sell side
- finite positive quantity
- finite positive execution price
- a valid execution timestamp
- finite non-negative commission

Execution records are immutable after creation.

## Responsibilities and boundaries

`Execution` records what actually happened. It does not decide strategy quality, risk acceptance, P&L interpretation, or broker connectivity.

The following remain future responsibilities:

- broker and venue adapters
- external execution identifiers
- richer fee/fee-currency models
- slippage and execution-quality analytics
- settlement
- reconciliation workflows
- persistence and event transport

These concerns are intentionally excluded from the initial domain foundation so that infrastructure does not leak into the deterministic core domain.

## Consequences

### Positive

- Partial fills are represented without losing individual fill history.
- Position updates can be based on actual executed quantity and price.
- Execution history remains auditable and traceable to its originating order.
- Higher-level analytics can derive aggregates from immutable execution records.

### Deferred work

Execution persistence, broker connectivity, reconciliation, richer fee modeling, and execution-quality analytics will be introduced when their surrounding infrastructure and contracts are designed.

## Validation

The Execution domain foundation is covered by dedicated domain tests and has been locally validated as part of the repository check with **48/48 tests passing** and TypeScript typechecking passing on 2026-09-14.
