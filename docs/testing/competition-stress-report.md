# TradeLedger Competition Stress-Test Report

**Report date:** 2026-10-10  
**Scope:** Competition authority, HTTP API, Server-Sent Events (SSE), persistence/recovery, participant isolation, and execution/position P&L consistency.

## Verified baseline

The local Windows development environment previously completed the repository test suite with:

- **60 test files passed**
- **383 tests passed**
- TypeScript typecheck passed
- Competition application/domain/persistence tests passed
- Execution/position P&L consistency and reconciliation tests passed

Observed stress measurements from successful runs (single development PC; not production capacity claims):

| Scenario | Workload | Observed result |
|---|---:|---:|
| Competition authority, application/domain | 10,000 decisions with 1,000 participants | 10,000 accepted in successful runs |
| HTTP participant snapshots | 1,000 requests | approximately 28–50 requests/second across runs |
| HTTP authority burst | 10,000 requests | approximately 65–87 requests/second across successful runs |
| SSE fanout | 1,000 connected subscribers, one policy event | 1,000/1,000 subscribers received the event |
| Combined HTTP + SSE | 1,000 participants, 1,000 SSE connections, 2,000 authorization requests | a successful run delivered all 2,000 decisions and the policy event to all 1,000 subscribers |

Measurements varied materially between runs. The test machine is a development environment, and these numbers must not be represented as production or multi-instance capacity.

## Latest optimization under validation

The 10,000-request HTTP authorization route previously serialized the complete authority result, including the competition engine state and its participant/performance/order-count structures, for every request. The stress client only consumes the authorization decision. The branch `fix/competition-http-authority-payload` changes this endpoint to return the compact `{ decision }` response and adds a regression test that rejects accidental full-state payloads. It also fixes the competition SSE connection comment so it emits real newline delimiters.

These are targeted payload/framing fixes, not a production-capacity claim. Validate the branch locally with the isolated authority burst, the complete API load profile, typecheck, and full repository checks before merging.

## Current follow-up and limitations

The combined HTTP + SSE test also produced intermittent `ECONNRESET` errors and test timeouts in other runs. Therefore, the latest stress gate must be rerun before declaring the current branch fully green.

Two changes are staged on branch `fix/competition-sse-stress-drain`:

1. Correct the competition SSE heartbeat to use actual newline delimiters (`\\n\\n` in the TypeScript string).
2. Keep each test SSE reader draining events throughout the HTTP burst. The previous test reader stopped as soon as it observed the policy event, leaving later events unread and allowing socket buffers to fill. The revised test fails if a stream closes before policy-event delivery and continues draining until cleanup.

These changes are **not yet locally validated** in this report. They must pass the isolated combined test, the full API load suite, typecheck, and the complete test suite before the report can be marked final.

## Final verification commands

Run from the repository root in Git Bash:

```bash
git pull origin main
git fetch origin
git switch --track origin/fix/competition-sse-stress-drain
npm run typecheck
npx vitest run tests/load/competition-api-load.test.ts -t "survives a combined HTTP"
npm run test:competition-api-load
npm run check
```

If the branch is already checked out locally, use `git pull origin fix/competition-sse-stress-drain` instead of creating a tracking branch again.

Record the final date, exact pass counts, duration, combined-test metrics, and any remaining failures here after the commands complete.
