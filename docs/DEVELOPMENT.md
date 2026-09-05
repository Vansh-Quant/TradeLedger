# Development Workflow

TradeLedger is built incrementally. Each change should leave the repository in a known, understandable state.

## Branches

- `main` — stable history
- `develop` — integration
- `feature/*` — new subsystem work
- `fix/*` — corrections
- `docs/*` — documentation changes

## Commit Style

Use small, meaningful commits with a clear scope:

- `feat(risk): add position risk model`
- `fix(oms): reject invalid order state transition`
- `test(backtest): cover fill simulation`
- `docs(architecture): document event contracts`
- `refactor(core): simplify instrument model`

## Engineering Rules

1. Define the contract before implementing a major subsystem.
2. Keep deterministic financial logic independently testable.
3. Add tests with behavior-changing code.
4. Do not commit secrets, private trading data, licensed datasets, or large generated artifacts.
5. Prefer reproducible research: record code version, dataset version, parameters, and execution assumptions.
6. Keep experimental research isolated from production services until it is validated.
7. Document important architectural decisions as ADRs.

## Integration Rule

Work should normally flow:

`feature/* → develop → main`

A change reaches `main` when it is understood, tested, and considered stable enough to become part of the project's known-good history.
