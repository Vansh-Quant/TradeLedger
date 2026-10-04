# ADR-020: Market Data Event Stream and Deterministic State

## Status

Accepted

## Context

TradeLedger now has canonical market-data objects and a provider-neutral ingestion
boundary. The next boundary needs to preserve ordered market-data delivery and
provide a deterministic current-state view without coupling the domain to a
broker, transport, database, or event-bus product.

## Decision

Add two small domain capabilities:

- An append-only in-memory market-data event stream that accepts strictly
  increasing envelope sequences and notifies subscribers in append order.
- A pure market-data state reducer that applies the same ordered envelopes and
  keeps the latest Quote, TradePrint, and Bar values.

Bar state is keyed by instrument and timeframe because multiple bar intervals
may exist simultaneously.

The reducer is immutable: each event produces a new state value. The event
stream keeps an ordered in-memory history for local development and tests.

## Invariants

- Event sequences must be strictly greater than the current sequence.
- Duplicate and out-of-order sequences are rejected.
- Event history is exposed as a snapshot.
- Subscriber notification follows append order.
- State updates are immutable and deterministic.
- Quote and trade state is keyed by instrument.
- Bar state is keyed by instrument and timeframe.
- No provider, transport, persistence, or broker behavior enters the domain.

## Deferred

- Durable market-data storage
- Distributed event buses
- Replay checkpoints
- Buffering and backpressure
- Provider reconnect/retry policy
- Market-data quality scoring
- Tick aggregation and derived bars
- Market calendars and corporate actions

## Consequences

Trading and research code can consume an ordered market-data stream or a
deterministic latest-state view without knowing how data arrived. The domain
remains small enough to test directly and can later be adapted to durable or
distributed infrastructure without changing the canonical market-data objects.
