# TradeLedger Status

**Last updated:** 2026-10-04

## Current Milestone

`v0.1-foundation`

## Completed

- Repository and deterministic trading-domain foundation
- Accounting ledger and risk/OMS hardening
- Normalized market-data foundation
- Execution persistence/recovery foundation
- Application service foundation
- Secure HTTP API transport foundation
- **Durable application infrastructure foundation**
- **Mutation idempotency and audit boundary foundation**
- HTTP request/response boundary
- Bearer authentication adapter boundary
- Application-layer account/action authorization
- Bounded headers and request bodies
- Strict JSON command parsing
- Generic error mapping without stack traces
- Security response headers and no-store policy
- Default in-memory rate limiting
- Health/readiness endpoints
- HTTP security integration tests
- Durable order-state and trading-context adapters
- Strict persisted-state validation
- Safe storage-key/path handling
- Atomic temporary-file write path with platform-specific replacement fallback
- Symlink rejection for persisted state
- Restart/reload persistence tests

## Validation

The durable infrastructure slice must pass:

- `npm install`
- `npm run check`
- full Vitest suite
- security verification / Freebuff where available

Do not promote until the local validation passes.

## Application / Infrastructure Boundary

The application layer owns use cases and depends on ports. Infrastructure implements those ports.

```
HTTP / Desktop / CLI
        ↓
Application Service
        ↓
Application Ports
        ↓
Infrastructure Adapters
        ↓
Durable Storage
        ↓
Deterministic Domain
```

The first durable adapters are intentionally small and local. They do not contain risk, accounting, lifecycle, position, or P&L logic.

## Durable Storage Security

The local durable JSON foundation provides:

- restricted single-segment storage keys
- explicit storage collections
- controlled storage roots
- rejection of symbolic-link roots/collections/files
- private temporary files
- fsync before replacement
- malformed JSON rejection
- schema/invariant validation before hydration
- account/context consistency checks
- no credential/principal storage
- fail-closed corruption behavior

The Windows replacement fallback can require unlinking an existing regular file before rename. This is documented as a current platform limitation; stronger transactional guarantees belong to a future database adapter.

## Production Security Gate

Before exposing the API outside a trusted local network, add TLS, production identity validation, secret management, durable edge rate limiting, audit events, replay/idempotency protection, network controls, monitoring, and dependency/container scanning.

## Mutation Idempotency / Audit Boundary

The current adapters are intentionally in-memory. They provide deterministic replay and conflict behavior within one running process but do not survive restart or provide cross-process transactional guarantees. Production deployment requires transactional durable persistence for business state, idempotency records, and required audit events.

## Next

- Production authentication provider integration
- Transactional application persistence boundary
- Broader HTTP integration coverage
- Frontend/trading workstation transport integration
