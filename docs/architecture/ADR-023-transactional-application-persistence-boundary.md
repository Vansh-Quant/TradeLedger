# ADR-023: Transactional Application Persistence Boundary

- **Status:** Accepted
- **Date:** 2026-10-04

## Context

The application service coordinates order state, trading context, mutation idempotency, and audit events. Individual durable JSON writes provide restart persistence but do not make a multi-record application mutation atomic.

The previous idempotency boundary was intentionally in-memory. Production-like retry behavior therefore needed a durable transaction boundary without moving financial rules into infrastructure.

## Decision

TradeLedger introduces an application transaction port:

- application services define the mutation boundary;
- infrastructure supplies the transaction implementation;
- deterministic domain logic remains unchanged;
- order state, trading context, idempotency records, and audit events may be committed as one application snapshot.

The local transactional adapter stores a versioned application snapshot through the existing durable JSON store. A transaction:

1. acquires an exclusive transaction lock;
2. reloads the latest snapshot;
3. executes application work against transaction-local state;
4. atomically persists the resulting snapshot on success;
5. restores the pre-transaction state on failure.

The adapter recovers stale locks only when the recorded process no longer exists. A live lock fails closed instead of allowing concurrent writers.

Idempotency records and audit events participate in the same transaction as the business state. Application-level mutation failures are recorded as failed idempotency/audit outcomes before the transaction completes; persistence failures roll back the transaction.

## Security and validation

Persisted snapshots are decoded through the existing order and trading-context validation codecs. Mutation keys are bounded printable values, fingerprints are fixed SHA-256 values, timestamps are validated, collection uniqueness is checked, and audit fields are bounded.

The transaction snapshot does not accept credentials, authorization headers, or raw request bodies.

## Consequences

Restart/reload can recover committed application state, idempotency records, and audit events.

The local adapter is deliberately small and dependency-free. It does not claim database-grade distributed concurrency, replication, or high-volume audit retention. The existing Windows replacement fallback can have a narrower crash-consistency window than a database transaction.

A future relational/database adapter can implement the same application transaction port with stronger isolation, concurrency, and recovery semantics without changing the deterministic domain or application use cases.
