# ADR-019: Market Data Provider and Ingestion Boundary

## Status

Accepted

## Decision

Define a provider-neutral market-data contract with explicit subscription, historical-data, and health operations.

Provider implementations emit canonical MarketDataPoint values. A thin ingestion boundary forwards canonical points to a sink.

The core does not know provider-specific transports, authentication, sockets, REST clients, or vendor schemas.

## Invariants

- Subscriptions require at least one instrument and one data kind.
- Duplicate subscription inputs are normalized.
- Provider health has a valid timestamp.
- Ingestion forwards provider data without changing domain meaning.
- Stop delegates to the provider subscription boundary.
- Sink failures propagate to the caller.

## Deferred

Concrete provider adapters, connection management, retries, rate limits, buffering, persistence, fan-out/event bus, historical backfill orchestration, and production health monitoring remain later infrastructure work.
