# ADR-018: Normalized Market Data Domain Foundation

## Status

Accepted

## Context

TradeLedger's architecture requires a canonical market-data layer between external providers and deterministic trading systems. The existing domain already defines canonical instruments, but there is no domain contract for normalized quotes, trades, bars, or ordered market-data envelopes.

## Decision

Introduce immutable normalized market-data domain objects:

- Quote for bid/ask observations
- TradePrint for executed market prints
- Bar for OHLCV time windows
- MarketDataEnvelope for ordered delivery metadata

The domain validates structural invariants at construction. Derived quote values such as mid-price and spread are deterministic functions.

External provider formats, transport protocols, subscriptions, persistence, and provider-specific fields remain outside this foundation.

## Invariants

- Quote bid and ask are positive and non-crossed.
- Quote sizes are positive.
- Trade price and quantity are positive.
- Bar end time is after start time.
- Bar high is at least open and close.
- Bar low is at most open and close.
- Bar volume is non-negative.
- Envelope sequence is a positive integer.
- Domain objects are immutable.

## Deferred

- Provider adapters
- Real-time subscriptions
- Historical ingestion
- Data normalization pipelines
- Corporate actions
- Market calendars
- Order-book depth
- Tick aggregation
- Data quality scoring
- Database storage

## Consequences

Trading and research components can consume a stable canonical market-data contract without knowing provider-specific schemas. This establishes the first layer of the Phase 1 market-data architecture while keeping ingestion and infrastructure concerns separate.
