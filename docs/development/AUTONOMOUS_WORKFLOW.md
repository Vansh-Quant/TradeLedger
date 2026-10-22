# TradeLedger Autonomous Development Workflow

## Goal

Reduce manual overhead between TradeLedger development chunks while preserving review, deterministic financial correctness, and safe Git practices. The repository is the source of truth so work can continue across ChatGPT conversations.

## Current implementation

### Stage 1: automated validation (implemented in this branch)

- GitHub Actions validates pull requests targeting `develop` or `main`.
- Pushes to `develop` and manual workflow dispatch also run the same validation.
- The workflow uses the committed npm lockfile, Node.js 24, and `npm run check`.
- Workflow permissions are read-only; it does not need API keys or paid AI services.
- CI never writes to branches, merges pull requests, deploys, or touches a broker.

### Stage 2: durable task queue (next)

Use GitHub Issues as the queue. Every development task should state:
1. Problem and scope.
2. Dependencies and prerequisites.
3. Acceptance criteria.
4. Relevant tests and validation commands.
5. Explicit out-of-scope work and safety constraints.

Only tasks explicitly marked ready by the maintainer should be eligible for an agent. A task must not be selected if its dependencies are unresolved or another task is changing the same area.

### Stage 3: coding agent (not yet configured)

An AI model must be available to implement code; GitHub Actions by itself is a test runner, not a coding agent. This setup currently has no configured API key or paid coding-agent plan.

The practical zero-subscription-cost experiment is a local Ollama model and a local agent on the Windows development PC. With 8 GB RAM and integrated graphics, start with a small quantized coding model (for example, Qwen2.5-Coder 1.5B) only as a feasibility test. Expect limited reasoning and slower output; do not assume it can reliably complete large or safety-critical chunks. Keep the model context small and close memory-heavy applications while testing. Local inference uses electricity and disk space, and is not guaranteed to be zero-cost in every sense.

Before any local worker can modify code, it must:
- operate only in a dedicated worktree/branch;
- select one explicitly ready issue at a time;
- cap task duration and repair attempts;
- run the repository validation commands;
- stop on repeated failures, ambiguous requirements, secrets, or security-sensitive changes;
- produce a diff and a pull request for human review;
- never merge or deploy automatically.

### Stage 4: sequential execution (only after a successful pilot)

After the local agent proves reliable on small documentation or test-only tasks, allow it to continue to the next ready issue. Begin with one task per run, then consider a small run limit. Do not give it unrestricted roadmap authority.

## Recommended operating loop

1. Maintain a single ready queue in GitHub Issues.
2. Pick the highest-priority task with all dependencies met.
3. Create a task-specific branch from the agreed integration branch.
4. Inspect relevant code and write a brief implementation plan.
5. Make the smallest coherent change and add tests.
6. Run `npm run check` when practical; report any skipped checks honestly.
7. Review the diff and create a pull request.
8. Update the issue and `DEVELOPMENT_STATUS.md` with evidence.
9. Wait for human review before merging.
10. Continue only if the next task is explicitly ready and the run budget permits it.

## Cost and resource boundaries

- GitHub Actions uses the repository's available GitHub Actions quota; confirm current plan limits in repository settings.
- The CI workflow added here requires no secrets and no paid AI provider.
- Local Ollama inference avoids per-token API charges but uses local CPU/RAM/storage and may be too slow or weak for complex implementation.
- Do not add cloud AI API secrets or third-party dependencies without an explicit decision.
- Never use GitHub as storage for datasets, model weights, private trading records, or runtime state.

## Success criteria

The workflow is useful only if it reduces manual coordination without lowering engineering quality. Track:
- tasks completed with acceptance criteria met;
- CI pass/fail and repair attempts;
- human review findings;
- regressions and rollbacks;
- time and local resource usage;
- tasks correctly stopped as blocked.

Do not measure success by number of generated lines or number of issues closed.
