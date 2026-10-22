# ADR-025: Workstation Visual System and Honest Data Presentation

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

The glass workstation (`packages/workstation-glass`) is the current browser UI. It already has shared terminal primitives, a Tailwind token layer, and a typed API client. Visual treatment is still a purple-tinted glass overlay with decorative glow, and several screens silently mix live account/order reads with `GET /api/v1/workstation/demo` fixtures.

Research, analytics, strategies, market-data quotes, and the trading chart series currently have **no production research/analytics engine** at the HTTP boundary. They are served only by the development demo payload. Competition lifecycle is real; some competition tiles still show hardcoded diagnostics. Journal analytics are derived from hosted/local journal records, not from the OMS.

## Decision

1. Keep the existing workstation architecture, routing, Radix/Tailwind primitives, Lucide icons, Recharts, and API contracts.
2. Recalibrate tokens toward a restrained near-black quantitative workstation: thin borders, opaque surfaces, tabular numerals, semantic P&L/risk color only.
3. Treat live account, order, position, risk, competition, and journal APIs as authoritative. Do not substitute demo fixtures when those reads are empty.
4. Keep `GET /api/v1/workstation/demo` as an explicitly labelled development fixture for screens that have no other backend contract.
5. Do not invent research scores, analytics ratios, strategy returns, or execution history in the browser.

## Consequences

Dashboard, orders, positions, executions, and risk may appear empty against a fresh development account. That is correct. Research/analytics/strategies/market-data remain available for UI validation only when the demo endpoint is enabled, and they must say so.

Follow-up phases: product-wide table/filter consistency, research/analytics empty contracts, JARVIS tool boundary, competition diagnostic honesty, and confirmation on high-impact controls.
