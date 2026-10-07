import { describe, expect, it } from "vitest";
import {
  calculateAccountMetrics,
  calculatePortfolioValuation,
  createBuyingPower,
  createCashBalance,
  createPortfolio,
  createPosition,
  applyFill,
  setPosition,
} from "../../core/domain/src/index.js";

describe("account metrics", () => {
  it("combines cash, mark-to-market P&L, exposure and buying power", () => {
    const position = applyFill(createPosition("AAPL"), "buy", {
      quantity: 10,
      price: 100,
    });
    const portfolio = setPosition(createPortfolio(), position);
    const valuation = calculatePortfolioValuation(
      portfolio,
      new Map([["AAPL", 120]]),
    );

    const metrics = calculateAccountMetrics(
      createCashBalance("USD", 9_000),
      valuation,
      0,
      createBuyingPower(10_000, 2_000),
    );

    expect(metrics.totalEquity).toBe(9_200);
    expect(metrics.unrealizedPnl).toBe(200);
    expect(metrics.marketValue).toBe(1_200);
    expect(metrics.grossExposure).toBe(1_200);
    expect(metrics.netExposure).toBe(1_200);
    expect(metrics.reservedBuyingPower).toBe(2_000);
    expect(metrics.availableBuyingPower).toBe(8_000);
  });
});
