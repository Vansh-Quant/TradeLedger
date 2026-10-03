# TradeLedger Security

## HTTP API baseline

The transport layer is security-first:

- Trading routes require authentication.
- Authorization remains in the application layer.
- Request headers and bodies are bounded.
- JSON content type is required for commands.
- Authentication failures use generic responses.
- Unexpected failures never return stack traces.
- Security response headers are applied.
- Trading responses are marked no-store.
- Rate limiting is enabled by default.
- Tokens are never logged by the API.
- CORS is disabled by default.
- Client-supplied roles are not trusted; the authenticated principal is passed to the application authorization boundary.

## Production requirements

Before exposing the API beyond a trusted local network:

1. Use TLS.
2. Replace the development static-token adapter with a real identity system.
3. Store secrets outside source control.
4. Add durable/distributed rate limiting.
5. Add audit events for authentication, authorization, order commands, and administration.
6. Add idempotency/replay protection for mutating requests.
7. Add network segmentation/firewall controls.
8. Add CSRF protection if browser cookies are introduced.
9. Add strict CORS allowlisting only when required.
10. Add dependency/container vulnerability scanning.
11. Add structured redacted logging and alerting.

Never commit broker credentials, API secrets, private keys, or session tokens.
