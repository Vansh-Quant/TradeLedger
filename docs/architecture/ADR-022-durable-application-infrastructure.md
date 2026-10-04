# ADR-022: Durable Application Infrastructure Boundary

## Status

Proposed

## Context

The application service foundation currently uses in-memory adapters. TradeLedger needs durable local state without coupling application services or deterministic domain logic to a concrete persistence engine.

Trading state is security-sensitive and must be treated as untrusted when reloaded from storage.

## Decision

Introduce durable application adapters under `core/infrastructure/` implementing the existing application ports.

The first implementation uses validated JSON records stored beneath an explicit local storage root.

The adapter:

- restricts keys to safe single filename segments
- rejects symbolic-link roots, collections, and persisted records
- validates persisted state before hydration
- preserves deterministic domain invariants
- writes through a temporary private file and fsync before replacement
- fails closed on malformed or structurally inconsistent state
- stores no principals, credentials, tokens, or API secrets

The application layer remains dependent only on ports.

## Consequences

### Positive

- Application services can survive process restart.
- Persistence can be replaced later without rewriting the application use cases.
- Corrupt or malicious local state cannot be silently hydrated.
- Account/context mismatches are rejected.
- The storage boundary is explicit and testable.

### Limitations

- The current local JSON implementation is not a multi-record database transaction.
- On platforms where rename-over-existing is rejected, replacement uses a validated unlink-then-rename fallback and therefore does not provide a fully atomic replacement window.
- Multi-process coordination is not yet provided.
- Production deployments should use a stronger transactional persistence implementation.

## Alternatives Considered

### PostgreSQL immediately

Rejected for this slice because it would add operational complexity before the application/infrastructure boundary is validated.

### In-memory only

Rejected because application restart would lose trading state.

### Direct filesystem access from application services

Rejected because it couples use cases to storage mechanics and weakens testing and future migration.

## Security Notes

This adapter is not an authentication or authorization system. Application authorization remains authoritative.

Production use requires additional controls including transactional persistence, secret management, operational filesystem permissions, backups, monitoring, and recovery procedures.
