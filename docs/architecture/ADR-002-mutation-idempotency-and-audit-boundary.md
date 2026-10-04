# ADR-002: Mutation Idempotency and Audit Boundary

- **Status:** Accepted
- **Date:** 2026-10-04

## Context

HTTP mutation requests can be retried by clients or intermediaries. A repeated mutation must not create a second business action when the original request already completed.

TradeLedger also needs a traceable application boundary for mutation requests without storing credentials, raw authorization headers, or unrestricted request bodies.

## Decision

Mutation idempotency is an application-layer port.

Each idempotency record is scoped by:

- idempotency key
- mutation operation
- account
- principal
- deterministic payload fingerprint

A completed identical request replays its original result. Reuse with a different operation, account, principal, or fingerprint is rejected as an idempotency conflict. An in-progress duplicate is rejected rather than executed concurrently.

Payload fingerprints use canonical JSON object-key ordering and SHA-256. Transport metadata such as request IDs, idempotency keys, and principal metadata are excluded from the fingerprint.

Mutating HTTP endpoints require a bounded printable Idempotency-Key header.

Audit events are emitted at the application boundary for:

- mutation requested
- mutation completed
- mutation failed
- authorization denied
- idempotency replay
- idempotency conflict
- idempotency in-progress

Audit records contain identifiers, operation/action, timestamp, outcome, and bounded reason metadata. Credentials, authorization headers, and raw request bodies are not stored.

The current implementation uses in-memory adapters. They are intentionally a boundary implementation, not a claim of durable transactional guarantees.

## Failure and durability semantics

Authorization and idempotency admission occur before the business mutation.

The current audit adapter is in-memory. An audit failure before the mutation prevents execution. An audit failure after a successful business mutation can leave the business state changed while the caller receives an error; this is an explicit limitation of the non-transactional adapter.

Before production use, idempotency records, business state, and required audit events must move behind transactional durable persistence so the mutation and its audit/idempotency state have atomic recovery semantics.

Process restart currently loses in-memory idempotency and audit state.

## Consequences

Retries are deterministic within one running application instance, and conflicting key reuse fails closed.

The application boundary remains independent of HTTP transport and can later be backed by a transactional database without moving idempotency or audit policy into the domain.

Production deployment requires durable transactional persistence before relying on idempotency for crash/restart guarantees.
