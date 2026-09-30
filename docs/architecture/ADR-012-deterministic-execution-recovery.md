# ADR-012: Deterministic Execution Recovery Workflow

## Status

Accepted

## Context

TradeLedger can record ordered execution history and replay it from a checkpoint. The next domain boundary is an explicit recovery workflow that validates a checkpoint against the journal and reports whether state was recovered or was already current.

## Decision

Add `recoverExecutionState()` as the deterministic recovery entry point.

The workflow:

1. validates an optional checkpoint
2. compares the checkpoint sequence with the journal head
3. skips replay when the checkpoint is already current
4. otherwise replays only entries after the checkpoint
5. returns the updated checkpoint and processed journal entries

The workflow continues to use canonical execution reconciliation. No second accounting or position engine is introduced.

## Invariants

- A checkpoint cannot reference a sequence beyond the journal head.
- A current checkpoint produces no additional reconciliation work.
- Recovery from a prior checkpoint processes only later journal entries.
- Initial state is not mutated.
- Execution IDs remain idempotent through the existing reconciliation path.

## Deferred

- Durable snapshot persistence
- Atomic journal/snapshot transactions
- Crash-consistent storage
- Recovery across multiple accounts or portfolios
- Broker-side recovery and external reconciliation
- Distributed recovery coordination

## Consequences

Execution recovery now has an explicit deterministic application boundary that can later sit behind a durable infrastructure adapter without moving accounting logic into storage code.
