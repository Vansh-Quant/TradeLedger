# TradeLedger Workstation

Dependency-free browser client for the existing TradeLedger application/API boundary.

## Scope

- Authenticated API connection
- Account selection through the workstation URL
- Trading context
- Account order list
- Position/exposure display
- Limit-order submission
- Order cancellation
- Server-owned idempotency
- Connection, loading, success, and error states
- Responsive workstation layout

## Local development

Serve the workstation with:

```bash
node packages/workstation/server.js
```

Then open:

```
http://127.0.0.1:4173/?account=ACC-APP&api=http%3A%2F%2F127.0.0.1%3A3000
```

Configure the HTTP API CORS allow-list for the workstation origin when the
workstation and API use different ports.

The access token is read from browser local storage under
`tradeledger.accessToken`. Production authentication is intentionally
deferred to the production identity-provider milestone.

## Deferred

Charts, WebSockets, live market streaming, strategy tooling, AI/JARVIS,
client-side risk calculation, and a frontend framework/bundler.


## Local API

The workstation expects the TradeLedger API at `http://127.0.0.1:3000`. Start the development API in a separate terminal with `npx --yes tsx packages/api/src/dev-server.ts`.

The development server creates the `ACC-APP` account in memory and accepts the bearer token `dev-token`. In the browser console, set `localStorage.tradeledger.accessToken = "dev-token"` once before loading the workstation. This bootstrap is development-only and is not production authentication or persistence.
