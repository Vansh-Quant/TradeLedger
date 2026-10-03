# ADR-020: Application Service Boundary

- Status: Accepted
- Date: 2026-10-03

## Context

TradeLedger's deterministic domain is now sufficiently complete to support an application layer.

The application layer must expose user-facing use cases without moving trading calculations, risk decisions, accounting, order lifecycle, or execution reconciliation into controllers or transport code.

## Decision

### Application services

Application services own use-case orchestration:

- validate command/query shape and basic input requirements
- authorize the principal for the requested account action
- load account trading context
- construct domain commands/objects
- invoke the deterministic trading-core workflow
- persist resulting application state through ports
- map domain outcomes into application results/errors

### Domain ownership

The domain remains authoritative for:

- order invariants
- risk checks
- buying-power reservation
- order lifecycle
- execution reconciliation
- position and portfolio derivation
- accounting

Application services must not duplicate those rules.

### Ports

The application package depends on explicit ports for:

- trading context retrieval/persistence
- order-state persistence
- authorization
- clock
- ID generation

Infrastructure implementations can replace the initial in-memory adapters without changing the use-case contracts.

### Cancellation

Cancellation is modeled as two steps:

1. request cancellation
2. complete cancellation after acknowledgement

The application layer must not report a completed cancellation merely because a cancellation request was submitted.

### Transport

HTTP, WebSocket, CLI, desktop, and voice interfaces are transport concerns. They call application services and map application errors to transport responses. They do not call domain internals directly.

## Consequences

- API controllers remain thin.
- Authorization is explicit and testable.
- Application workflows can be tested without a web framework.
- Persistent infrastructure can be introduced behind ports.
- Asynchronous broker acknowledgement can be added without changing the domain ownership model.
