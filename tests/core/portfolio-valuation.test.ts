import { describe, expect, it } from "vitest";
import {
  applyFill,
  calculatePortfolioValuation,
  createPortfolio,
  createPosition,
  setPosition,
} from "../../core/domain/src/index.js";

describe("portfolio valuation", () => {
  it("marks long and short positions at current prices", () => {
    const long = applyFill(createPosition("AAPL"), "buy", { quantity: 10, price: 100 });
    const short = applyFill(createPosition("TSLA"), "sell", { quantity: 5, price: 200 });
    const portfolio = setPosition(setPosition(createPortfolio(), long), short);

    const valuation = calculatePortfolioValuation(
      portfolio,
      new Map([
        ["AAPL", 120],
        ["TSLA", 180],
      ]),
    );

    expect(valuation.marketValue).toBe(300);
    expect(valuation.netExposure).toBe(300);
    expect(valuation.grossExposure).toBe(2100);
    expect(valuation.unrealizedPnl).toBe(300);
  });

  it("requires a mark for every active position", () => {
    const position = applyFill(createPosition("AAPL"), "buy", { quantity: 1, price: 100 });
    const portfolio = setPosition(createPortfolio(), position);

    expect(() => calculatePortfolioValuation(portfolio, new Map())).toThrow(
      "markPrice for AAPL must be a positive finite number",
    );
  });
});
