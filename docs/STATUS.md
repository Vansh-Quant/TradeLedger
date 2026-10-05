## Execution Engine — Application/API Ingress

- Connected execution reports to the existing deterministic `processTradingExecution` workflow.
- Added authorized `execution.record` application action.
- Execution ingress validates account/order/instrument/side before reconciliation.
- Partial and complete fills update order lifecycle, positions, portfolio state, and buying-power reservations through the existing domain workflow.
- Duplicate execution IDs remain idempotent through the execution event store.
- Added HTTP `POST /api/v1/executions` and a typed workstation API client method.
- Added application and HTTP tests for partial fills, complete fills, duplicate execution IDs, idempotency-key replay semantics, idempotency conflicts, authorization, and validation.
- Application-level execution mutation replays now report `applied: false` and `duplicate: true` while preserving the original deterministic result.
- Broker/venue adapters remain a separate integration layer and are intentionally not fabricated by the dev server.

## Market Data Engine — Application/API Boundary

- Added an application-facing market-data state port.
- Added authorized application reads for instrument snapshots and state lists.
- Added HTTP endpoints for market-data reads and a typed API client.
- Connected infrastructure state storage to the provider-ingestion sink boundary.
- Development API now exposes a deterministic AAPL feed snapshot for workstation integration tests/manual development.
- Market data remains read-only at the HTTP boundary; browser code does not manufacture authoritative prices.
- Production provider credentials/feed adapters remain intentionally deferred.

# TradeLedger Status

**Last updated:** 2026-10-05

## Current Milestone

`v0.1-foundation`

## Completed

- Repository and deterministic trading-domain foundation
- Accounting ledger and risk/OMS hardening
- Normalized market-data foundation
- Execution persistence/recovery foundation
- Application service foundation
- Secure HTTP API transport foundation
- **Durable application infrastructure foundation**
- **Mutation idempotency and audit boundary foundation**
- **Transactional application persistence boundary foundation**
- HTTP request/response boundary
- Bearer authentication adapter boundary
- Application-layer account/action authorization
- Bounded headers and request bodies
- Strict JSON command parsing
- Generic error mapping without stack traces
- Security response headers and no-store policy
- Default in-memory rate limiting
- Health/readiness endpoints
- HTTP security integration tests
- Durable order-state and trading-context adapters
- Strict persisted-state validation
- Safe storage-key/path handling
- Atomic temporary-file write path with platform-specific replacement fallback
- Symlink rejection for persisted state
- Restart/reload persistence tests

## Validation

The durable infrastructure slice must pass:

- `npm install`
- `npm run check`
- full Vitest suite
- security verification / Freebuff where available

Do not promote until the local validation passes.

## Application / Infrastructure Boundary

The application layer owns use cases and depends on ports. Infrastructure implements those ports.

```
HTTP / Desktop / CLI
        ↓
Application Service
        ↓
Application Ports
        ↓
Infrastructure Adapters
        ↓
Durable Storage
        ↓
Deterministic Domain
```

The first durable adapters are intentionally small and local. They do not contain risk, accounting, lifecycle, position, or P&L logic.

## Durable Storage Security

The local durable JSON foundation provides:

- restricted single-segment storage keys
- explicit storage collections
- controlled storage roots
- rejection of symbolic-link roots/collections/files
- private temporary files
- fsync before replacement
- malformed JSON rejection
- schema/invariant validation before hydration
- account/context consistency checks
- no credential/principal storage
- fail-closed corruption behavior

The Windows replacement fallback can require unlinking an existing regular file before rename. This remains a platform limitation of the local adapter; a future database adapter can provide stronger multi-record and high-concurrency guarantees.

## Production Security Gate

Before exposing the API outside a trusted local network, add TLS, production identity validation, secret management, durable edge rate limiting, audit events, replay/idempotency protection, network controls, monitoring, and dependency/container scanning.

## Mutation Idempotency / Audit Boundary

The default adapters remain in-memory for lightweight use and tests. The transactional application adapter persists order state, trading context, idempotency records, and audit events in one versioned snapshot and commits them through the existing atomic durable JSON write path. It uses an exclusive transaction lock and fails closed when another process owns the lock. A future database adapter can provide stronger multi-record concurrency and recovery guarantees.

## Market Data Engine

- Canonical quote, trade, and bar models are retained as the deterministic market-data boundary.
- Added per-instrument market-data state with independent latest quote/trade/bar snapshots.
- Added monotonic sequence protection and observation-time ordering protection.
- Added deterministic stale-data evaluation.
- Added a state book that assigns per-instrument ingestion sequences without coupling the domain to a provider clock.
- Provider ingestion remains separated from state storage through the existing sink contract.

## Trading Workstation UI Integration

- The first browser workstation now consumes the existing secured HTTP/application boundary.
- Account context, order listing, positions/exposure, limit-order entry, cancellation, idempotency, and connection/loading/error states are represented.
- Order admission inputs remain server-side; the workstation does not perform risk calculations or fabricate market data.
- A browser framework/bundler, WebSockets, live market data, professional charts, strategy tooling, and AI/JARVIS remain deferred.
- See `docs/architecture/ADR-024-trading-workstation-ui.md` for the accepted boundary.

## OMS Hardening — In Progress

- Added fail-closed order state invariants for hydrated/mutated lifecycle state.
- Lifecycle operations now reject impossible filled quantities and inconsistent terminal state.
- Durable application audit hydration now accepts the full application action set, including execution recording and market-data reads.
- Added persistence regression coverage for execution audit events across adapter recreation.
- Expiry now releases outstanding buying-power reservations, including partially filled remainders.
- IOC executions automatically cancel any unfilled remainder after an applied partial fill.
- FOK executions reject partial fills and require the complete remaining quantity.
- Lifecycle transitions now permit partially filled orders to expire while preserving applied fills.
- The typed API client now accepts trading intent only; authoritative admission/risk fields cannot be supplied by the workstation client.

## Application Event Architecture — Completed

- Added a typed application event boundary for order and execution lifecycle events.
- Added a deterministic in-memory event bus with monotonic sequence cursors and replay-oriented reads.
- Application mutations now publish lifecycle events only after the underlying domain state mutation is applied.
- Idempotent mutation replays do not create duplicate lifecycle events.
- Event consumers remain outside deterministic risk, accounting, execution, and persistence calculations.
- Durable transactional persistence now stores the event stream atomically with application state and idempotency records.
- Durable event cursors can replay events after restart without losing sequence continuity.
- Corrupt, duplicated, skipped, or out-of-transaction event writes fail closed.
- Transaction rollback restores application events together with orders, contexts, mutations, and audit state.

## Next

- Validate the completed event architecture locally, then extend it to real-time workstation transport.
- Production authentication provider integration


## Real-Time Event Transport — In Progress

- Added an authenticated, account-scoped Server-Sent Events API at `GET /api/v1/events`.
- Added sequence-based replay and reconnect semantics.
- Added account-scoped subscriptions with authorization at the application boundary.
- Durable subscribers are notified only after the surrounding transaction is durably committed; rollback never leaks phantom events.
- Transport subscriber failures cannot alter committed trading mutations.
- Added typed API-client SSE consumption and workstation live refresh/reconnect behavior.
- Added bounded SSE buffering to fail closed under excessive downstream backpressure.
- Added application/API regression coverage for subscription authorization, delivery, replay sequence, and cleanup.
