# ADR-017: SQL Execution Persistence Adapter

## Status

Accepted

## Decision

TradeLedger adds a PostgreSQL-oriented execution persistence adapter using injected SQL client and transaction interfaces.

The adapter handles execution event storage, ordered reads, execution-ID idempotency, recovery snapshot storage, and transaction commit/rollback.

The database driver remains outside the domain. Domain calculations and trading workflows remain deterministic and independent of SQL.

## Deferred

Concrete driver wiring, production migrations, operational deployment, scaling, retention, and cross-process concurrency testing are deferred.
