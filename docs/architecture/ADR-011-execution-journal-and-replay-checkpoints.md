# ADR-011: Execution Journal and Replay Checkpoints

## Status

Accepted

## Context

TradeLedger now records execution events and can replay them from the beginning. A growing execution history needs an ordered cursor so recovery and replay do not always have to process the entire history.

## Decision

Add an ordered execution journal with local monotonically increasing sequence numbers and checkpoint-aware replay.

The journal remains an abstraction. The in-memory implementation is for deterministic development and testing; durable persistence remains an infrastructure concern.

A replay checkpoint contains:

- the reconciled execution state
- the last journal sequence included in that state

Replay processes only entries after that sequence.

## Invariants

1. Sequence numbers increase monotonically within a journal instance.
2. A repeated execution ID does not create another journal entry.
3. Reusing an execution ID with different execution data is rejected.
4. Replay after a checkpoint uses the same canonical reconciliation logic.
5. A checkpoint cursor never causes earlier journal entries to be applied again.

## Deferred

- Durable database-backed journal
- Cross-process sequence allocation
- Transactional checkpoint persistence
- Crash-consistent snapshots
- Journal compaction and archival
- Distributed event ordering

## Consequences

The execution subsystem now has a clearer recovery path:

```text
Execution Events
      ↓
Ordered Journal
      ↓
Checkpoint
      ↓
Replay only new events
      ↓
Canonical Reconciliation
      ↓
Order + Portfolio State
```

This creates a foundation for durable recovery without introducing a database into the domain layer.
