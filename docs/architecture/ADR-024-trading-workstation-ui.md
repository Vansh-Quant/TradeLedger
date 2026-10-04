# ADR-024: Trading Workstation UI Boundary

## Status

Accepted

## Context

TradeLedger now exposes application services through a secured HTTP transport.
The next layer is the first browser workstation.

The workstation must remain a client of the existing application/domain
boundaries. It must not become a second trading engine or reproduce risk,
execution, authorization, or persistence behavior.

## Decision

Add a deliberately small browser-native workstation slice with:

- authenticated HTTP requests using the existing bearer-token boundary
- account-context display
- account order listing
- position and exposure display from authoritative application state
- limit-order entry
- order cancellation
- server-owned idempotency keys
- connection, loading, success, and error states
- responsive terminal layout

The workstation uses browser-native HTML, CSS, and JavaScript rather than adding
a frontend framework or bundler before one is required.

Order submission sends trading intent only. Admission inputs are derived inside
the application service from the authoritative trading context. The workstation
does not calculate risk, exposure, or fake market prices.

## Deferred

- Production identity provider
- Real-time/WebSocket transport
- live market data
- professional charting
- watchlist pricing
- strategy builder
- AI/JARVIS
- client-side risk engines
- frontend component framework

## Consequences

The first terminal can exercise real TradeLedger application behavior without
duplicating domain logic. A future frontend framework or real-time transport
can replace the presentation/runtime layer without changing the trading
contracts.
