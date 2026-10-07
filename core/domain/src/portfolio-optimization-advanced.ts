import type { AssetStatistics, OptimizedWeight } from "./portfolio-optimization.js";

function normalize(raw: readonly number[], assets: readonly AssetStatistics[]): readonly OptimizedWeight[] {
  const clipped=raw.map(x=>Math.max(0,x));
  const total=clipped.reduce((s,x)=>s+x,0);
  if(total===0) return Object.freeze(assets.map(a=>Object.freeze({id:a.id,weight:1/assets.length})));
  return Object.freeze(assets.map((a,i)=>Object.freeze({id:a.id,weight:clipped[i]!/total})));
}

export function minimumVolatilityWeight(assets: readonly AssetStatistics[]): readonly OptimizedWeight[] {
  if(assets.length===0) throw new Error("assets must not be empty");
  if(assets.some(a=>a.volatility<=0||!Number.isFinite(a.volatility))) throw new Error("volatility must be positive and finite");
  return normalize(assets.map(a=>1/(a.volatility*a.volatility)),assets);
}

export function maxSharpeApproxWeight(
  assets: readonly AssetStatistics[],
  riskFreeRate=0,
): readonly OptimizedWeight[] {
  if(assets.length===0) throw new Error("assets must not be empty");
  if(!Number.isFinite(riskFreeRate)) throw new Error("riskFreeRate must be finite");
  return normalize(assets.map(a=>(a.expectedReturn-riskFreeRate)/a.volatility),assets);
}
