export interface PositionRiskInput {
  readonly instrumentId: string;
  readonly marketValue: number;
  readonly volatility: number;
}
export interface RiskBudget {
  readonly maxGrossExposure: number;
  readonly maxNetExposure: number;
  readonly maxPositionWeight: number;
  readonly targetVolatility?: number;
}
export interface PortfolioRisk {
  readonly grossExposure: number;
  readonly netExposure: number;
  readonly concentration: number;
  readonly weights: readonly { readonly instrumentId:string; readonly weight:number }[];
  readonly breaches: readonly string[];
}

export function calculatePortfolioRisk(
  positions: readonly { readonly instrumentId:string; readonly marketValue:number }[],
  equity: number,
  budget: RiskBudget,
): PortfolioRisk {
  if(!Number.isFinite(equity)||equity<=0) throw new Error("equity must be positive and finite");
  if(budget.maxGrossExposure<0||budget.maxNetExposure<0||budget.maxPositionWeight<=0) throw new Error("risk budget is invalid");
  const gross=positions.reduce((s,p)=>s+Math.abs(p.marketValue),0);
  const net=positions.reduce((s,p)=>s+p.marketValue,0);
  const weights=positions.map(p=>({instrumentId:p.instrumentId,weight:p.marketValue/equity}));
  const concentration=weights.reduce((s,p)=>s+p.weight*p.weight,0);
  const breaches:string[]=[];
  if(gross/equity>budget.maxGrossExposure) breaches.push("gross exposure limit exceeded");
  if(Math.abs(net)/equity>budget.maxNetExposure) breaches.push("net exposure limit exceeded");
  if(weights.some(p=>Math.abs(p.weight)>budget.maxPositionWeight)) breaches.push("position weight limit exceeded");
  return Object.freeze({grossExposure:gross/equity,netExposure:net/equity,concentration,weights:Object.freeze(weights),breaches:Object.freeze(breaches)});
}

export function volatilityTargetSize(
  equity:number,
  targetVolatility:number,
  estimatedVolatility:number,
  maxLeverage=1,
): number {
  if(!Number.isFinite(equity)||equity<=0||!Number.isFinite(targetVolatility)||targetVolatility<=0||!Number.isFinite(estimatedVolatility)||estimatedVolatility<=0) throw new Error("volatility inputs must be positive and finite");
  if(!Number.isFinite(maxLeverage)||maxLeverage<=0) throw new Error("maxLeverage must be positive and finite");
  return Math.min(equity*maxLeverage,equity*targetVolatility/estimatedVolatility);
}
