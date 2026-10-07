import { describe, expect, it } from "vitest";
import {
  barCloses, calculatePerformance, createBar, createResearchSeries,
  createStrategyDefinition, runBacktest, createWalkForwardWindows,
  runWalkForward, optimizeStrategy, createStrategyRegistry, registerStrategy,
  getStrategy, runResearchExperiment, simpleMovingAverage, exponentialMovingAverage,
  returns, volatility, type InstrumentId,
} from "../../core/domain/src/index.js";

function bars(): ReturnType<typeof createBar>[] {
  return [100,102,104,103,106,108,107,110].map((close,i)=>createBar({
    instrumentId:"AAPL" as InstrumentId,timeframeSeconds:60,
    startAt:`2026-10-07T10:${String(i).padStart(2,"0")}:00Z`,
    endAt:`2026-10-07T10:${String(i).padStart(2,"0")}:59Z`,
    open:close,high:close+1,low:close-1,close,volume:100,
  }));
}
const strategy=createStrategyDefinition({
  id:"SMA-1",name:"SMA strategy",parameters:{period:3},
  evaluate:({closes})=>closes.length>=3 && (closes.at(-1)!>closes.at(-2)!) ? "long" : "flat",
});

describe("phase 4 research engine",()=>{
 it("builds ordered series and deterministic indicators",()=>{
  const series=createResearchSeries("AAPL",bars());
  expect(series.bars).toHaveLength(8);
  expect(barCloses(series.bars)).toEqual([100,102,104,103,106,108,107,110]);
  expect(simpleMovingAverage([1,2,3],3)).toBe(2);
  expect(exponentialMovingAverage([1,2,3],3)).toBe(2);
  expect(returns([100,110])).toEqual([0.1]);
  expect(volatility([100,101,102])).toBeGreaterThan(0);
 });
 it("runs a deterministic backtest and metrics",()=>{
  const result=runBacktest({strategy,bars:bars(),initialCapital:10000,quantity:10,commissionPerTrade:1});
  const metrics=calculatePerformance(result);
  expect(result.strategyId).toBe("SMA-1");
  expect(result.equityCurve.length).toBe(9);
  expect(metrics.tradeCount).toBeGreaterThan(0);
 });
 it("creates walk-forward windows",()=>{
  const windows=createWalkForwardWindows(20,10,5);
  expect(windows).toEqual([{trainFrom:0,trainTo:10,testFrom:10,testTo:15}]);
 });
 it("runs walk-forward tests",()=>{
  const result=runWalkForward({strategy,bars:bars(),trainSize:4,testSize:2,initialCapital:10000});
  expect(result.windows.length).toBe(2);
  expect(result.tests).toHaveLength(2);
 });
 it("registers immutable strategy versions",()=>{
  let registry=createStrategyRegistry();
  registry=registerStrategy(registry,strategy);
  expect(getStrategy(registry,"SMA-1")?.version).toBe(1);
  expect(()=>registerStrategy(registry,strategy)).toThrow("strategy version already registered");
 });
 it("optimizes parameter candidates and records experiments",()=>{
  const optimized=optimizeStrategy({strategy,bars:bars(),parameterSets:[{period:2},{period:3}],initialCapital:10000});
  expect(optimized?.parameters.period).toBeDefined();
  const experiment=runResearchExperiment({id:"EXP-1",strategy,bars:bars(),initialCapital:10000,createdAt:"2026-10-07T12:00:00Z"});
  expect(experiment.strategyId).toBe("SMA-1");
  expect(experiment.result.tradeCount).toBeGreaterThan(0);
 });
});
