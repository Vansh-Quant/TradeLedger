# ADR-021: HTTP API Transport and Security Boundary

- Status: Accepted
- Date: 2026-10-03

## Decision

HTTP is a thin transport over application services. Controllers do not calculate risk, buying power, accounting, P&L, positions, or lifecycle transitions.

The initial transport enforces:

- explicit bearer authentication
- application-layer account/action authorization
- constant-time comparison in the development static-token adapter
- 16 KiB maximum request headers
- 32 KiB default JSON body limit
- strict JSON content type for commands
- finite-number validation
- generic authentication and unexpected-error responses
- request correlation IDs
- no-store responses
- restrictive security headers
- default in-memory rate limiting
- no CORS allowance by default
- no credential/token logging

The static token adapter is for development/test use only. Production identity must use a dedicated identity provider or signed-token validation with key rotation.

Health/readiness endpoints expose only minimal process state and do not require trading authorization.

Before external exposure, production still requires TLS, secret management, durable edge rate limiting, audit logging, replay/idempotency controls, network controls, monitoring, and dependency/container scanning.
