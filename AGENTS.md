# TradeLedger Agent Instructions

These instructions apply to every human or automated contributor working in this repository.

## Source of truth

- Read `README.md`, `ARCHITECTURE.md`, and `ROADMAP.md` before taking on an unfamiliar subsystem.
- Inspect the current code, package scripts, tests, and recent history before proposing or making changes.
- Treat repository state and accepted architecture decisions as authoritative; chat summaries are context, not a substitute for code.
- Keep `docs/development/DEVELOPMENT_STATUS.md` current when a development task is completed or blocked.

## Safety boundaries

- Never commit directly to `main` or `develop`. Work on a dedicated branch and submit a pull request.
- Never merge a pull request or deploy changes autonomously.
- Do not overwrite unrelated user changes, force-push, or rewrite branch history.
- Never commit secrets, broker credentials, private trading data, licensed market data, or local environment files.
- Do not connect to a live broker, place trades, or change live execution permissions as part of automated development.
- Do not disable, weaken, or delete a test or security control merely to make validation pass.
- If requirements are ambiguous, a dependency is missing, or a safety-critical design choice is unresolved, stop and report the blocker rather than inventing behavior.

## Engineering rules

- Follow `ARCHITECTURE.md`: deterministic financial, accounting, risk, order, position, and backtest logic must remain auditable and independent of probabilistic AI behavior.
- Define or preserve explicit contracts and dependency direction. Keep transport, application, infrastructure, and domain responsibilities separate.
- Prefer the smallest change that satisfies the acceptance criteria. Avoid unnecessary dependencies, abstractions, duplicate logic, generated boilerplate, and unrelated refactors (Ponytail simplification principle).
- Add or update tests for behavior changes, including relevant failure and boundary cases.
- Preserve backwards compatibility unless the task explicitly authorizes a breaking change.
- Do not claim a test, type check, build, or manual verification passed unless it actually ran and passed.

## Required validation

- Read the `scripts` in the root `package.json` and use the repository's defined commands.
- Run `npm ci` when validating a clean checkout with the committed lockfile.
- Run `npm run check` for the full project validation gate when practical.
- If full validation cannot run, run the narrowest relevant tests and clearly report what was skipped and why.
- Review the final diff for unrelated changes, accidental secrets, and unnecessary complexity.

## Task completion

A task is complete only when its acceptance criteria are addressed, relevant validation results are recorded, and the changes are available on a non-protected branch for human review. Report changed files, test commands and results, known limitations, and the next dependency-ready task. A green CI run alone does not establish product correctness.
