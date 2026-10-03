# TradeLedger Status

**Last updated:** 2026-10-03

## Current Milestone

`v0.1-foundation`

## Completed

- Repository and architecture foundation
- Deterministic trading domain foundation
- Accounting ledger and risk/OMS hardening
- Normalized market-data foundation
- Execution persistence/recovery foundation
- **Application service foundation**
- Application command/query contracts
- Application validation and authorization boundary
- Trading application service for order submission, cancellation request/completion, and order queries
- In-memory application adapters for trading context and order state
- Application error model
- Application tests covering domain delegation, authorization, validation, state persistence, and cancellation acknowledgement

## Validation

The application feature branch must pass:

- `npm run check`
- full Vitest suite

Do not promote until the local validation passes.

## Application Boundary

The application layer sits between transports and deterministic domain workflows.

```text
HTTP / Desktop / CLI / Voice
            ↓
      Application Services
            ↓
      Deterministic Domain
            ↓
 Infrastructure / Persistence
```

Application services own use-case orchestration, validation, authorization, DTO/command mapping, and port coordination. They do not calculate risk, P&L, positions, accounting, or execution state.

Cancellation is explicitly request/acknowledgement based. A request does not release the reservation until completion is confirmed.

## Next

- HTTP API transport
- Request/response DTO mapping
- Transport error mapping
- API authentication/authorization adapter
- Application/domain integration tests at the HTTP boundary
- Persistence adapter for application state
