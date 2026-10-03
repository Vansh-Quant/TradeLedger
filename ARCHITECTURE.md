# TradeLedger Architecture

## 1. Architectural Goal

TradeLedger is a modular personal trading and quantitative research platform. The architecture must support discretionary trading, systematic strategies, realistic research, automated execution, and AI-assisted orchestration without coupling financial correctness to probabilistic AI behavior.

## 2. Core Principle

**Deterministic engines calculate. Agents interpret. JARVIS orchestrates. The user commands.**

### Deterministic domain

The following systems must have explicit, testable, deterministic behavior:

- Instrument/reference-data model
- Market-data normalization
- Account and ledger accounting
- Orders and OMS
- Positions and fills
- Risk calculations and limits
- P&L
- Backtest mechanics
- Execution simulation
- Portfolio exposure and allocation
- Strategy runtime contracts

### Intelligence domain

AI/ML systems may assist with:

- Research discovery
- Natural-language analysis
- News interpretation
- Pattern/context extraction
- Experiment assistance
- Strategy development assistance
- Anomaly diagnosis
- Reporting
- User behavior/context interpretation

AI must not silently override deterministic risk, accounting, or execution controls.

## 3. Major Layers

```text
┌──────────────────────────────────────────────┐
│ User / Desktop / Web / Mobile / Voice        │
├──────────────────────────────────────────────┤
│ Trading Terminal / Research Lab / Operations  │
├──────────────────────────────────────────────┤
│ JARVIS / Agents / Intelligence                │
├──────────────────────────────────────────────┤
│ Strategies / Portfolio / Research             │
├──────────────────────────────────────────────┤
│ Backtesting / Replay / Simulation              │
├──────────────────────────────────────────────┤
│ Execution / OMS / Risk / Positions / Accounts │
├──────────────────────────────────────────────┤
│ Market Data / News / Reference Data            │
├──────────────────────────────────────────────┤
│ Event Bus / Data Core / Storage                │
├──────────────────────────────────────────────┤
│ NAS / Cloud / Compute / Network                │
└──────────────────────────────────────────────┘
```

## 4. Data Flow

External providers feed normalized market, reference, fundamental, news, and alternative data into the data layer. Domain services consume these streams through stable contracts and publish events. Applications subscribe to state and events rather than implementing their own financial logic.

```text
External Sources
      ↓
Ingestion → Validation → Normalization
      ↓
Market/Data Core
      ↓
Event Bus
      ├── Accounts
      ├── OMS / Execution
      ├── Positions
      ├── Risk
      ├── Journal
      ├── Analytics
      ├── Backtesting
      ├── Research
      └── Intelligence
```

## 5. Application Boundary

The application layer is the use-case boundary between transports and the deterministic domain.

```text
HTTP / Desktop / CLI / Voice
            ↓
      Application Services
            ↓
      Deterministic Domain
            ↓
 Infrastructure / Persistence
```

Application services own:

- command/query contracts
- basic input validation
- authorization
- use-case orchestration
- DTO/result mapping
- coordination through infrastructure ports

They must not duplicate:

- risk calculations
- buying-power rules
- accounting
- order lifecycle
- execution reconciliation
- position/P&L calculation

Cancellation is explicitly request/acknowledgement based: a request moves an order to `cancel_requested`; reservation release occurs only when cancellation completion is confirmed.

## 6. Service Boundaries

Each major subsystem should define:

- Purpose
- Inputs
- Outputs
- Commands
- Events
- Persistence model
- API contract
- Error model
- Failure/recovery behavior
- Observability requirements
- Unit and integration tests

Services should communicate through explicit contracts rather than direct access to each other's internal state.

## 6. Trading Domain Dependency Direction

A target dependency direction is:

```text
Instrument Model
      ↓
Market Data
      ↓
Account / Ledger
      ↓
OMS
      ↓
Positions
      ↓
Risk
      ↓
Journal / Analytics
      ↓
Terminal / Intelligence
```

Execution adapters sit beneath the OMS and translate canonical orders into venue-specific representations.

## 7. Research Reproducibility

Every meaningful research experiment should be reproducible from recorded metadata:

- Strategy ID and version
- Git commit
- Dataset ID and version
- Instrument universe
- Time range
- Timeframe
- Parameters
- Execution model
- Fees/commissions
- Slippage assumptions
- Random seeds where applicable
- Code/runtime version
- Results and artifacts

## 8. Strategy Lifecycle

```text
Idea
 ↓
Development
 ↓
Backtest
 ↓
Robustness / Validation
 ↓
Out-of-Sample
 ↓
Paper / Forward Test
 ↓
Approval
 ↓
Deployment
 ↓
Monitoring
 ↓
Retire / Revise
```

No strategy should move directly from idea to production deployment without the appropriate validation gates.

## 9. Risk Architecture

Risk is a platform-level service, not a feature owned by an individual strategy. It should be capable of enforcing account, portfolio, strategy, instrument, and system-level limits.

Higher-level AI systems may request actions, but risk controls remain authoritative.

## 10. Observability

Every production subsystem should expose structured logs, metrics, health state, traces where useful, and actionable failure information. Automated systems must support restart/recovery and clear operational state.

## 11. Storage Architecture

The long-term storage model is tiered:

- Hot: high-performance local/NVMe storage for active databases and research
- Warm: NAS/HDD storage for historical datasets and artifacts
- Cold: archival/cloud/object storage for long-term retention

GitHub stores source code and engineering metadata. It is not the primary warehouse for market data or research artifacts.

## 12. Security

Credentials and sensitive data stay outside source control. Production access, execution permissions, AI autonomy, and remote administration must be explicitly controlled and auditable.

## 13. Evolution

Architecture decisions should be documented as ADRs under `docs/architecture/`. Major changes require a written rationale, alternatives considered, consequences, and migration strategy.
