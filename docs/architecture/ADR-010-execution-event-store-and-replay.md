# ADR-010: Execution Event Store and Replay Foundation

## Status

Accepted

## Context

Execution-state reconciliation currently derives order fill state and account/portfolio position state from actual executions. The system also needs a durable boundary for recording executions and a deterministic way to rebuild state from recorded execution history.

The first infrastructure step should not introduce a database dependency or duplicate financial logic.

## Decision

Add explicit contracts and workflows for an immutable recorded-execution envelope, an append-oriented ExecutionEventStore, a deterministic in-memory reference implementation, deterministic execution replay, and a processing workflow that coordinates duplicate detection, reconciliation, and event recording.

Execution IDs are the idempotency identity. A repeated execution ID is ignored. Reusing an execution ID with different execution data is rejected by the in-memory store.

## Invariants

1. Execution data remains the source of truth for fills and position changes.
2. Replay uses the canonical reconciliation workflow rather than implementing a second accounting path.
3. Invalid executions are not recorded by the processing workflow.
4. Duplicate execution delivery does not change order or portfolio state.
5. Event history is append-oriented.
6. Durable atomic transactions are not claimed by the in-memory adapter.

## Consequences

### Positive

- Execution history has an explicit storage boundary.
- State can be rebuilt deterministically from execution history.
- Tests can exercise event recording without a database.
- A future database/event-log adapter can implement the same contract.
- Idempotency remains explicit instead of being hidden in persistence code.

### Deferred

- Database persistence
- Transactional append + state update
- Crash recovery
- External broker reconciliation
- Event versioning/schema evolution
- Partitioning and high-volume storage
- Retention and archival policies

## Alternatives Considered

### Put persistence directly inside ExecutionReconciliation

Rejected because reconciliation should remain deterministic domain logic and should not own storage concerns.

### Introduce a database immediately

Rejected for this foundation because it would add infrastructure complexity before the storage contract and replay semantics are stable.

### Create a second fill/position calculation path for replay

Rejected because duplicated financial logic creates divergence risk. Replay must reuse the canonical reconciliation path.

## Testing

The feature adds coverage for:

- event envelope validation
- append and lookup behavior
- duplicate execution handling
- conflicting execution-id reuse
- deterministic replay
- replay idempotency
- processing and recording order
- rejection without event persistence
