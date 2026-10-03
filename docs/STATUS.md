# TradeLedger Status

**Last updated:** 2026-10-03

## Current Milestone

`v0.1-foundation`

## Completed

- Repository and deterministic trading-domain foundation
- Accounting ledger and risk/OMS hardening
- Normalized market-data foundation
- Execution persistence/recovery foundation
- Application service foundation
- **Secure HTTP API transport foundation**
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

## Validation

The current API feature branch must pass:

- `npm install`
- `npm run check`
- full Vitest suite

Do not promote until the local validation passes.

## HTTP/API Security Boundary

The API is a thin transport over application services.

Trading routes require authentication and are authorized by the application layer. The transport validates request shape and bounds request size but does not calculate risk, buying power, accounting, P&L, positions, or lifecycle transitions.

Security controls in this slice include:

- Bearer authentication boundary
- constant-time comparison in the development static-token adapter
- 16 KiB maximum request headers
- 32 KiB default JSON body limit
- strict JSON content type
- finite-number validation
- generic authentication failures
- generic unexpected-error responses
- opaque request IDs
- no-store responses
- restrictive response headers
- default rate limiting
- CORS disabled by default
- no credential logging

The static token adapter is for development/test use only.

## Production Security Gate

Before exposing the API outside a trusted local network, add TLS, production identity validation, secret management, durable edge rate limiting, audit events, replay/idempotency protection, network controls, monitoring, and dependency/container scanning.

## Next

- Durable/persistent application adapters
- API authentication provider integration
- Mutating-request idempotency
- Audit/event emission
- Broader HTTP integration coverage
- Frontend/trading workstation transport integration
