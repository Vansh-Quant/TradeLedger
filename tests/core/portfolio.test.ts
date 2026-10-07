import { describe, expect, it } from "vitest";
import {
  applyFill,
  calculatePortfolioUnrealizedPnl,
  calculateUnrealizedPnl,
  createPortfolio,
  markPortfolio,
  createPosition,
  setPosition,
} from "../../core/domain/src/index.js";

describe("Portfolio", () => {
  it("starts empty", () => {
    const portfolio = createPortfolio();

    expect(portfolio.positions.size).toBe(0);
    expect(portfolio.realizedPnl).toBe(0);
    expect(portfolio.unrealizedPnl).toBe(0);
    expect(portfolio.marketValue).toBe(0);
    expect(portfolio.netExposure).toBe(0);
    expect(portfolio.grossExposure).toBe(0);
  });

  it("adds an active position and derives exposure", () => {
    const position = applyFill(createPosition("AAPL"), "buy", {
      quantity: 50,
      price: 100,
    });
    const portfolio = setPosition(createPortfolio(), position);

    expect(portfolio.positions.size).toBe(1);
    expect(portfolio.marketValue).toBe(5_000);
    expect(portfolio.netExposure).toBe(5_000);
    expect(portfolio.grossExposure).toBe(5_000);
  });

  it("aggregates long and short exposure", () => {
    const empty = createPortfolio();
    const long = applyFill(createPosition("AAPL"), "buy", {
      quantity: 50,
      price: 1_000,
    });
    const short = applyFill(createPosition("TSLA"), "sell", {
      quantity: 30,
      price: 1_000,
    });

    const portfolio = setPosition(setPosition(empty, long), short);

    expect(portfolio.netExposure).toBe(20_000);
    expect(portfolio.grossExposure).toBe(80_000);
    expect(portfolio.marketValue).toBe(20_000);
  });

  it("removes a flat position from active positions", () => {
    const opened = applyFill(createPosition("AAPL"), "buy", {
      quantity: 10,
      price: 100,
    });
    const portfolio = setPosition(createPortfolio(), opened);
    const closed = applyFill(opened, "sell", {
      quantity: 10,
      price: 110,
    });
    const updated = setPosition(portfolio, closed);

    expect(updated.positions.has("AAPL")).toBe(false);
    expect(updated.realizedPnl).toBe(100);
  });

  it("calculates long and short unrealized P&L", () => {
    const long = applyFill(createPosition("AAPL"), "buy", {
      quantity: 10,
      price: 100,
    });
    const short = applyFill(createPosition("TSLA"), "sell", {
      quantity: 10,
      price: 100,
    });

    expect(calculateUnrealizedPnl(long, 120)).toBe(200);
    expect(calculateUnrealizedPnl(short, 80)).toBe(200);
  });

  it("calculates aggregate unrealized P&L from mark prices", () => {
    const long = applyFill(createPosition("AAPL"), "buy", {
      quantity: 10,
      price: 100,
    });
    const short = applyFill(createPosition("TSLA"), "sell", {
      quantity: 10,
      price: 100,
    });
    const portfolio = setPosition(setPosition(createPortfolio(), long), short);

    const marks = new Map([
      ["AAPL", 120],
      ["TSLA", 80],
    ]);

    expect(calculatePortfolioUnrealizedPnl(portfolio, marks)).toBe(400);
  });

  it("updates portfolio valuation from current marks", () => {
    const position = applyFill(createPosition("AAPL"), "buy", {
      quantity: 10,
      price: 100,
    });
    const portfolio = setPosition(createPortfolio(), position);
    const marked = markPortfolio(portfolio, new Map([["AAPL", 120]]));

    expect(marked.marketValue).toBe(1_200);
    expect(marked.netExposure).toBe(1_200);
    expect(marked.grossExposure).toBe(1_200);
    expect(marked.unrealizedPnl).toBe(200);
    expect(portfolio.marketValue).toBe(1_000);
    expect(portfolio.unrealizedPnl).toBe(0);
  });

  it("requires a mark price for every active position", () => {
    const position = applyFill(createPosition("AAPL"), "buy", {
      quantity: 10,
      price: 100,
    });
    const portfolio = setPosition(createPortfolio(), position);

    expect(() => calculatePortfolioUnrealizedPnl(portfolio, new Map())).toThrow(
      "missing mark price for instrument AAPL",
    );
  });
});
