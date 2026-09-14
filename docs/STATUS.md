# TradeLedger Status

**Last updated:** 2026-09-14

## Current Milestone

`v0.1-foundation`

## Completed

- Repository and architecture foundation
- Security and Git workflow documentation
- Development workflow documentation
- Instrument domain model
- Trading specification domain model
- Order domain model
- Position domain model
- Portfolio aggregate foundation
- Domain test coverage for the completed components

## Validation

Latest reported local validation:

- TypeScript typecheck: passing
- Vitest: 5 test files passing
- Tests: **40/40 passing**

## Next

- Execution domain foundation
- Execution domain tests
- Account domain foundation
- Cash and equity model
- Buying power foundation
- Basic risk boundaries
- Account/Portfolio integration

## Guiding Principle

Build the foundation before adding trading complexity. Every subsystem should have a clear contract, deterministic behavior where required, tests, observability, and a defined failure model.
