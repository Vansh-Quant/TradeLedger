# ADR-003 — Account and Cash Domain Foundation

- **Status:** Accepted
- **Date:** 2026-09-17
- **Scope:** Core trading domain

## Context

TradeLedger needs an account-level boundary before introducing buying power,
risk limits, broker connectivity, and multi-account orchestration. The account
must not become a catch-all object containing portfolio state, cash accounting,
risk logic, and infrastructure concerns.

## Decision

Introduce two focused foundations:

1. `Account` represents account identity, base currency, and lifecycle state.
2. `CashBalance` represents base-currency settled cash and provides explicit
   deposit/withdrawal operations.

Account lifecycle is modeled as:

```text
active <-> suspended
active  -> closed
suspended -> closed
```

Closed accounts cannot be reactivated or suspended.

Equity is initially defined as:

```text
Equity = Settled Cash + Unrealized P&L
```

Realized P&L is not added separately because the accounting flow is expected
to reflect realized results in settled cash.

## Boundaries

The initial foundation intentionally excludes:

- buying power
- leverage
- margin requirements
- financing and borrowing
- multi-currency cash
- broker cash reconciliation
- settlement workflows
- portfolio ownership wiring
- account-level risk limits
- external broker/account identifiers

These will be introduced only when their contracts are explicitly designed.

## Invariants

### Account

- identity must be non-empty
- base currency must be non-empty and normalized
- account creation produces an active account
- lifecycle transitions must be explicit and valid
- account state is immutable

### Cash

- currency must be non-empty and normalized
- initial cash cannot be negative
- deposits and withdrawals must be positive
- withdrawals cannot exceed available cash
- cash state is immutable
- equity calculations require finite unrealized P&L

## Consequences

The model gives later risk and execution layers a stable account identity without
mixing operational state into deterministic domain objects. Cash and equity can
then evolve independently before buying power and margin semantics are added.
