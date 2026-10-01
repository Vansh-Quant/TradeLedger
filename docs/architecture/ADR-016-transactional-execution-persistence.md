# ADR-016: Transactional Execution Persistence Boundary

## Status

Accepted

## Context

The execution persistence foundation can append events and store recovery snapshots, but durable infrastructure needs an atomic boundary so an execution record and its corresponding checkpoint can be committed together or neither can be committed.

## Decision

Add an explicit `ExecutionPersistenceTransaction` contract.

A transaction may stage execution events and a recovery snapshot, then either:

- `commit()` to publish the complete staged set atomically, or
- `rollback()` to publish nothing.

Snapshot validation uses the transaction's staged journal head, allowing a snapshot to reference events committed in the same transaction.

The reference implementation remains in-memory. Database adapters will map this contract to real database transactions later.

## Invariants

1. A transaction cannot be nested on the same persistence instance.
2. A closed transaction cannot be reused.
3. Rollback leaves the persistent journal and snapshot unchanged.
4. Commit publishes staged events and the validated snapshot together.
5. Snapshot sequence must match its checkpoint sequence and cannot exceed the staged journal head.
6. Existing execution-ID idempotency remains enforced.

## Deferred

- PostgreSQL transaction implementation
- Isolation-level selection
- Cross-process locking
- Write-ahead logging
- Crash recovery at storage level
- Database migrations

## Consequences

The execution/recovery persistence seam now has an explicit transaction model. This prepares the platform for a PostgreSQL adapter without moving transaction mechanics into deterministic domain logic.
