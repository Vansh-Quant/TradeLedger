/**
 * TradeLedger core domain.
 *
 * Domain objects are intentionally framework-agnostic. Infrastructure,
 * persistence, and UI concerns must not leak into this layer.
 */

export * from "./instrument.js";
export * from "./account.js";
export { createCashBalance, depositCash, withdrawCash, calculateEquity } from "./cash.js";
export * from "./buying-power.js";
export * from "./risk-boundary.js";
export * from "./account-portfolio.js";
export * from "./order-admission.js";
export * from "./order-lifecycle.js";
export * from "./execution-reconciliation.js";
export * from "./execution-event-store.js";
export * from "./execution-replay.js";
export * from "./execution-processing.js";
export * from "./execution-journal.js";
export * from "./execution-recovery.js";
export * from "./trading-core-workflow.js";
export * from "./order-buying-power-reservation.js";
export * from "./order.js";
export * from "./execution.js";
export * from "./position.js";
export * from "./portfolio.js";
export * from "./market-data.js";
export * from "./market-data-quality.js";
export * from "./market-data-provider.js";
export * from "./market-data-ingestion.js";

// Accounting ledger domain
export * from "./ledger.js";

// OMS domain
export * from "./oms-workflow.js";

export * from "./market-data-state.js";

export * from "./portfolio-valuation.js";
export * from "./execution-settlement.js";

export * from "./order-expiry.js";

export * from "./account-metrics.js";

export * from "./portfolio-marking.js";

export * from "./watchlist.js";
export * from "./alerts.js";
export * from "./charting.js";
export * from "./trading-workspace.js";
export * from "./intelligence.js";
export * from "./market-context.js";
export * from "./economic-calendar.js";

export * from "./terminal-session.js";
export * from "./intelligence-feed.js";

export * from "./intelligence-events.js";

export * from "./research-series.js";
export * from "./indicators.js";
export * from "./strategy.js";
export * from "./backtest.js";
export * from "./performance.js";
export * from "./walk-forward.js";
export * from "./strategy-registry.js";
export * from "./optimization.js";
export * from "./research-experiment.js";

export * from "./strategy-lifecycle.js";

export * from "./research-features.js";
export * from "./research-validation.js";
export * from "./research-report.js";
export * from "./benchmark.js";

export * from "./research-dataset.js";
export * from "./robustness.js";
export * from "./strategy-promotion.js";

export * from "./parameter-grid.js";
export * from "./monte-carlo.js";
export * from "./strategy-engine.js";
export * from "./portfolio-allocation.js";
export * from "./research-cache.js";

export * from "./strategy-combinators.js";
export * from "./research-lab.js";
export * from "./oos-validation.js";

export * from "./portfolio-analytics.js";
export * from "./portfolio-risk.js";
export * from "./portfolio-optimization.js";
export * from "./factor-engine.js";
export * from "./portfolio-attribution.js";

export * from "./covariance.js";
export * from "./portfolio-optimization-advanced.js";
export * from "./risk-budget.js";

export * from "./competition.js";
export * from "./competition-authority.js";
export * from "./competition-leaderboard.js";
export * from "./competition-engine.js";

export * from "./competition-access.js";
export * from "./competition-controls.js";
export * from "./competition-audit.js";
export * from "./competition-policy.js";
export * from "./competition-idempotency.js";
export * from "./competition-trading-gate.js";
export * from "./competition-control-executor.js";
export * from "./competition-registration.js";
export * from "./competition-leaderboard-update.js";
