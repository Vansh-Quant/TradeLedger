import { describe, expect, it } from "vitest";
import {
  analyzePortfolioReturns,
  calculatePortfolioRisk,
  volatilityTargetSize,
  equalWeight,
  inverseVolatilityWeight,
  riskParityWeight,
  maxReturnWeight,
  zScoreCrossSection,
  rankFactor,
  compositeFactorScore,
  attributePnl,
  covarianceMatrix,
  correlationMatrix,
  minimumVolatilityWeight,
  maxSharpeApproxWeight,
  validateRiskBudgets,
} from "@tradeledger/domain";

describe("phase 5 portfolio quant engine", () => {
  it("calculates portfolio risk-adjusted analytics", () => {
    const result = analyzePortfolioReturns([0.01, -0.005, 0.02, 0.01], [0.008, -0.002, 0.015, 0.006]);
    expect(result.volatility).toBeGreaterThan(0);
    expect(Number.isFinite(result.sharpe)).toBe(true);
    expect(Number.isFinite(result.sortino)).toBe(true);
    expect(Number.isFinite(result.beta)).toBe(true);
    expect(Number.isFinite(result.correlation)).toBe(true);
  });

  it("detects portfolio exposure breaches", () => {
    const result = calculatePortfolioRisk(
      [{ instrumentId: "AAPL", marketValue: 7000 }, { instrumentId: "NVDA", marketValue: -3000 }],
      10000,
      { maxGrossExposure: 0.8, maxNetExposure: 0.5, maxPositionWeight: 0.6 },
    );
    expect(result.grossExposure).toBe(1);
    expect(result.netExposure).toBe(0.4);
    expect(result.breaches).toContain("gross exposure limit exceeded");
    expect(result.breaches).toContain("position weight limit exceeded");
  });

  it("sizes a position to a volatility target", () => {
    expect(volatilityTargetSize(100000, 0.1, 0.2)).toBe(50000);
  });

  it("builds deterministic portfolio allocations", () => {
    expect(equalWeight([{id:"A",expectedReturn:.1,volatility:.2},{id:"B",expectedReturn:.2,volatility:.3}]).map(x=>x.weight))
      .toEqual([0.5,0.5]);
    expect(inverseVolatilityWeight([{id:"A",expectedReturn:.1,volatility:.2},{id:"B",expectedReturn:.2,volatility:.4}]).map(x=>x.weight))
      .toEqual([2/3,1/3]);
    expect(riskParityWeight([{id:"A",expectedReturn:.1,volatility:.2},{id:"B",expectedReturn:.2,volatility:.4}]).map(x=>x.weight))
      .toEqual([2/3,1/3]);
    expect(maxReturnWeight([{id:"A",expectedReturn:.1,volatility:.2},{id:"B",expectedReturn:.2,volatility:.4}]))
      .toEqual([{id:"A",weight:0},{id:"B",weight:1}]);
  });

  it("scores and ranks factors", () => {
    const z=zScoreCrossSection([{instrumentId:"A",value:1},{instrumentId:"B",value:2},{instrumentId:"C",value:3}]);
    expect(z[0]!.score).toBeLessThan(0);
    expect(rankFactor([{instrumentId:"A",value:1},{instrumentId:"B",value:3}],true))
      .toEqual([{instrumentId:"B",rank:1},{instrumentId:"A",rank:2}]);
    expect(compositeFactorScore([
      {instrumentId:"A",factor:"momentum",score:1},
      {instrumentId:"A",factor:"value",score:0.5},
    ],{momentum:1,value:1})[0]!.score).toBeCloseTo(0.75);
  });

  it("calculates covariance and correlation matrices", () => {
    const covariance = covarianceMatrix({ A: [0.01,0.02,0.03], B: [0.01,0.02,0.04] });
    expect(covariance).toHaveLength(2);
    expect(covariance[0]![0]).toBeGreaterThan(0);
    const correlation = correlationMatrix({ A: [0.01,0.02,0.03], B: [0.01,0.02,0.04] });
    expect(correlation[0]![0]).toBeCloseTo(1);
  });

  it("supports constrained portfolio optimization and risk budgets", () => {
    const assets = [
      {id:"A",expectedReturn:0.08,volatility:0.2},
      {id:"B",expectedReturn:0.12,volatility:0.4},
    ];
    expect(minimumVolatilityWeight(assets)[0]!.weight).toBeGreaterThan(minimumVolatilityWeight(assets)[1]!.weight);
    expect(maxSharpeApproxWeight(assets)[0]!.weight).toBeGreaterThan(maxSharpeApproxWeight(assets)[1]!.weight);
    expect(validateRiskBudgets([{id:"A",budget:0.6},{id:"B",budget:0.4}])).toEqual([]);
    expect(validateRiskBudgets([{id:"A",budget:0.8},{id:"B",budget:0.4}])).toContain("risk budget total cannot exceed 1");
  });

  it("attributes P&L", () => {
    expect(attributePnl([{id:"strategy-a",pnl:75},{id:"strategy-b",pnl:25}]))
      .toEqual([{id:"strategy-a",pnl:75,contributionPct:.75},{id:"strategy-b",pnl:25,contributionPct:.25}]);
  });
});
