# ADR-015: Durable Execution Persistence Boundary

## Status

Accepted

## Context

TradeLedger's execution journal, replay, checkpoints, and recovery are deterministic but currently backed by in-memory structures. The next layer must introduce persistence without moving accounting or recovery logic into storage code.

## Decision

Introduce an infrastructure-level `ExecutionPersistence` contract with an in-memory reference implementation.

The contract owns:

- append-oriented execution records
- monotonic journal sequence assignment
- execution-ID idempotency
- ordered reads after a sequence cursor
- recovery snapshot storage
- snapshot sequence validation

The domain remains responsible for execution reconciliation, replay, and recovery state. Infrastructure stores records and snapshots but does not calculate positions, fills, P&L, risk, or buying power.

## Invariants

1. Execution IDs are idempotent.
2. Conflicting reuse of an execution ID is rejected.
3. Journal sequences increase monotonically.
4. A snapshot sequence must equal its checkpoint sequence.
5. A snapshot cannot be ahead of the persisted journal head.
6. Persistence does not mutate trading-domain state.

## Deferred

- PostgreSQL implementation
- Transaction boundaries
- Atomic event + snapshot commits
- Crash-consistent durable storage
- Schema migrations/versioning
- Retention and archival
- Distributed ordering
- Multi-process concurrency control

## Consequences

TradeLedger now has an explicit infrastructure seam for durable execution storage. A database adapter can be introduced without changing deterministic domain reconciliation or recovery contracts.
