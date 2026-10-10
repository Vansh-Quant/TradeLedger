# TradeLedger Development Status

Last updated: 2026-10-10

## Current project context

- Product phase: `v0.1-foundation` (see `README.md` and `ROADMAP.md`).
- Core rule: deterministic engines calculate; agents interpret; JARVIS orchestrates; the user commands.
- Primary validation command: `npm run check`.
- Package manager: npm 11 as declared by `package.json`; use the committed `package-lock.json`.
- Development changes require a dedicated branch and human-reviewed pull request. Never push directly to `main` or `develop`.

## Autonomous workflow status

| Capability | Status | Notes |
|---|---|---|
| Persistent agent instructions | Added in this branch | `AGENTS.md` |
| Automated CI validation | Added in this branch | `.github/workflows/ci.yml`; requires a successful GitHub Actions run to verify |
| Workflow plan | Added in this branch | `docs/development/AUTONOMOUS_WORKFLOW.md` |
| GitHub Issues task queue | Not configured | Define ready labels and task templates before an agent consumes tasks |
| Local coding model | Not configured | No model has been installed or benchmarked on the 8 GB Windows PC |
| Autonomous code changes | Not enabled | No API key or coding-agent subscription is configured |
| Automatic pull-request creation by agent | Not enabled | Must be added only after the local agent pilot passes |
| Automatic merge/deployment | Prohibited | Human approval remains required |

## Immediate next steps

1. Open and review the workflow pull request from `automation/zero-cost-dev-workflow`.
2. Confirm the GitHub Actions run passes on the repository.
3. Set up a small, explicitly scoped issue queue.
4. Test a local coding model on a low-risk task before permitting source-code changes.
5. Measure memory use and validation reliability before enabling sequential tasks.

## Reporting rules

Record completed tasks with links to the pull request, exact validation commands and results, and any skipped checks. Keep unverified work marked as unverified. Do not infer that a roadmap item is complete from a chat message alone; confirm it against the repository and tests.
