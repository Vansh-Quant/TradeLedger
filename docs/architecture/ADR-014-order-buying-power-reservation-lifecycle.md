# ADR-014: Order Buying-Power Reservation Lifecycle

## Status

Accepted

## Context

Trading-core admission currently reserves buying power for an admitted order. Without an explicit order-level reservation lifecycle, fills and cancellation cannot deterministically release the capacity that is no longer committed.

## Decision

Attach an immutable `OrderBuyingPowerReservation` to admitted trading-core state.

The reservation records:

- order ID
- initial approved notional
- remaining reserved amount
- order quantity

For an applied fill, reservation release is proportional to filled quantity using the original approved notional per order unit. A completed cancellation releases all remaining reservation.

Cancellation remains a two-step lifecycle:

`cancel_requested` → `cancelled`

Only cancellation completion releases the remaining reservation.

Duplicate executions do not release buying power again because release occurs only when the canonical execution-processing workflow reports `applied: true`.

## Invariants

1. Reserved capacity never increases during a release operation.
2. A fill cannot release more reservation than the order's remaining quantity permits.
3. Duplicate execution delivery does not release reservation twice.
4. Cancellation request does not release capacity.
5. Cancellation completion releases all remaining order reservation.
6. Actual cash settlement remains separate from buying-power reservation accounting.

## Deferred

- Market-price-based dynamic reservation adjustments
- Margin and leverage models
- Broker-specific reservation semantics
- Settlement and cash movement
- Cross-order netting
- Portfolio-level collateral models

## Consequences

Buying-power reservation now follows the order lifecycle instead of remaining permanently reserved after an order is filled or cancelled. The trading-core composition boundary can therefore track committed capacity more accurately without coupling it to broker or settlement infrastructure.
