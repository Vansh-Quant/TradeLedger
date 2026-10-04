# ADR-003: Workstation HTTP Transport Boundary

- **Status:** Accepted
- **Date:** 2026-10-04

## Context

TradeLedger needs a transport that allows a future desktop/web workstation to read trading state and issue commands without moving trading logic into the UI.

## Decision

The workstation integrates through the existing HTTP API/application boundary.

The transport provides:

- authenticated trading-context reads
- authenticated order reads
- order submission
- cancellation and cancellation completion
- bounded request bodies and idempotency keys for mutations
- explicit CORS origin allowlisting
- a small typed client for workstation callers

The typed client accepts a token provider rather than persisting credentials itself.

The API remains a transport adapter. Validation, authorization, idempotency, transactions, risk, order lifecycle, and financial calculations remain outside the UI/client.

## Consequences

The workstation can be developed independently from the deterministic domain and application services.

CORS is deny-by-default when configured and never accepts a wildcard origin.

Realtime/WebSocket transport is intentionally deferred until the workstation requires streaming market/order updates; the current HTTP boundary is sufficient for command/query integration.
