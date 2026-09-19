# ADR-005 — Basic Risk Boundaries

- **Status:** Accepted
- **Date:** 2026-09-19
- **Scope:** Core trading domain

## Context

TradeLedger needs deterministic guardrails before order admission and more
advanced risk calculations are introduced. The first layer should express
simple hard limits without embedding broker, strategy, or portfolio-optimization
logic.

## Decision

Introduce immutable RiskLimits with five basic boundaries:

- maximum order notional
- maximum position notional
- maximum gross exposure
- maximum absolute net exposure
- maximum daily loss

Pure check functions return an explicit allowed/rejected result. Invalid
configuration and invalid measured inputs are rejected as programming/domain
errors.

## Boundaries

This foundation does not calculate:

- leverage
- margin
- VaR
- volatility risk
- correlation risk
- liquidity risk
- broker-specific limits
- strategy-specific limits
- portfolio optimization

It also does not own order lifecycle or automatically reserve buying power.
Those responsibilities remain in later risk/OMS workflows.

## Invariants

- every configured limit is finite and positive
- measured risk values are finite and non-negative
- net exposure is evaluated by absolute magnitude
- equality with a configured limit is allowed
- exceeding a limit produces a deterministic rejection result
- risk-limit state is immutable

## Consequences

TradeLedger now has a small, testable risk boundary primitive that later
order-admission and account-risk workflows can compose without mixing policy
configuration with broker or execution concerns.
