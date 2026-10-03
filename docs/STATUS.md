# TradeLedger Status

**Last updated:** 2026-10-03

## Current Milestone

v0.1-foundation

## Completed

- Repository and architecture foundation
- Security and Git workflow documentation
- Development workflow documentation
- Instrument domain model
- Normalized market-data domain foundation
- Provider-neutral market-data subscription and ingestion boundary
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
- Ordered execution journal and replay checkpoint foundation
- Deterministic execution recovery workflow foundation
- Deterministic trading core order-to-execution workflow foundation
- Order-level buying-power reservation lifecycle foundation
- Durable execution persistence boundary foundation
- Transactional execution persistence boundary foundation
- Normalized market-data foundation
- Accounting ledger foundation
- Centralized risk-engine foundation
- OMS orchestration foundation
- Domain hardening tests for accounting, risk, and OMS
- Canonical-domain delegation for OMS lifecycle and execution behavior

## Validation

The current feature branch adds new domain code and tests after the previously validated 24-file / 180-test baseline.

Final local promotion gate for this branch:

- npm run check
- full Vitest suite

Do not mark this feature complete until the local commands pass.

## Domain Decisions

### Accounting Ledger

- Cash operations delegate to the canonical Cash domain.
- Realized and unrealized P&L are signed.
- Equity is settled cash plus current unrealized P&L.
- Ledger transaction timestamps are explicit and validated.
- Cash reservations cannot exceed available unreserved cash.
- Ledger entries cannot contain both debit and credit.
- See docs/architecture/ADR-019-domain-hardening-accounting-oms-risk.md.

### Centralized Risk Engine

- Risk decisions are deterministic.
- Policies are account-scoped.
- Net exposure is evaluated by absolute magnitude.
- Draft, paused, retired, and disabled policies do not admit orders.
- Buying-power availability is part of final admission evaluation.
- Advanced margin, leverage, VaR, financing, and portfolio optimization remain deferred.

### OMS

- OMS composes the existing deterministic TradingCoreWorkflow.
- OrderLifecycle remains canonical for state transitions.
- ExecutionReconciliation remains canonical for execution application.
- Buying-power reservation and release remain canonical.
- OMS does not maintain an independent portfolio or position engine.
- Duplicate executions remain idempotent.

## Previously Accepted Foundations

### Execution

- Execution records an immutable actual fill associated with an Order.
- One order may produce zero, one, or many executions.
- Position changes are based on actual executions, not requested order quantity.
- Broker connectivity, richer fee modeling, settlement, and execution-quality analytics remain deferred.
- See docs/architecture/ADR-002-execution-domain-foundation.md.

### Account and Cash

- Account owns identity, base currency, and lifecycle state.
- CashBalance owns base-currency settled cash operations.
- Equity is initially settled cash plus unrealized P&L.
- Leverage, margin, financing, multi-currency cash, settlement, and broker reconciliation remain deferred.
- See docs/architecture/ADR-003-account-and-cash-foundation.md.

### Risk Boundaries

- RiskLimits defines immutable hard boundaries for order notional, position notional, gross exposure, absolute net exposure, and daily loss.
- Risk checks return deterministic allowed/rejected results.
- Broker-specific margin, leverage, advanced risk models, and automatic order admission remain separate concerns.
- See docs/architecture/ADR-005-basic-risk-boundaries.md.

### Account and Portfolio Integration

- AccountPortfolio binds account identity to portfolio state.
- Actual Execution records drive position and portfolio updates.
- Buying power, risk admission, cash settlement, and broker concerns remain separate.
- See docs/architecture/ADR-006-account-portfolio-integration.md.

### Order Admission and Lifecycle

- admitOrder composes deterministic risk boundaries and buying-power capacity.
- OrderLifecycle defines immutable state transitions.
- filledQuantity tracks actual applied quantity and cannot exceed ordered quantity.
- See ADR-007 and ADR-008.

### Execution Reconciliation and Recovery

- Execution IDs are applied at most once.
- Duplicate execution delivery is idempotent.
- Execution history has explicit event-store, journal, replay, checkpoint, and recovery boundaries.
- Durable database persistence and crash-consistent storage remain infrastructure concerns.
- See ADR-009 through ADR-016.

### Normalized Market Data

- Canonical Quote, TradePrint, Bar, and MarketDataEnvelope objects define the normalized market-data boundary.
- Provider formats, ingestion transport, subscriptions, persistence, calendars, and data-quality infrastructure remain separate concerns.
- See docs/architecture/ADR-018-normalized-market-data-foundation.md.

## Next

- API / application service layer
- Explicit DTO and command/query boundaries
- Application-level validation and authorization
- HTTP transport without moving financial logic into controllers
- Integration tests from API/application boundary into deterministic domain

## Guiding Principle

Build the foundation before adding trading complexity. Every subsystem should have a clear contract, deterministic behavior where required, tests, observability, and a defined failure model.
