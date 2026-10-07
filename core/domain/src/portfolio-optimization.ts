export interface AssetStatistics {
  readonly id: string;
  readonly expectedReturn: number;
  readonly volatility: number;
}
export interface OptimizedWeight { readonly id:string; readonly weight:number; }

export function equalWeight(assets: readonly AssetStatistics[]): readonly OptimizedWeight[] {
  if(assets.length===0) throw new Error("assets must not be empty");
  const w=1/assets.length;
  return Object.freeze(assets.map(a=>Object.freeze({id:a.id,weight:w})));
}

export function inverseVolatilityWeight(assets: readonly AssetStatistics[]): readonly OptimizedWeight[] {
  if(assets.length===0) throw new Error("assets must not be empty");
  if(assets.some(a=>a.volatility<=0||!Number.isFinite(a.volatility))) throw new Error("volatility must be positive and finite");
  const raw=assets.map(a=>1/a.volatility), total=raw.reduce((s,x)=>s+x,0);
  return Object.freeze(assets.map((a,i)=>Object.freeze({id:a.id,weight:raw[i]!/total})));
}

export function riskParityWeight(assets: readonly AssetStatistics[]): readonly OptimizedWeight[] {
  return inverseVolatilityWeight(assets);
}

export function maxReturnWeight(assets: readonly AssetStatistics[]): readonly OptimizedWeight[] {
  if(assets.length===0) throw new Error("assets must not be empty");
  const best=assets.reduce((a,b)=>b.expectedReturn>a.expectedReturn?b:a);
  return Object.freeze(assets.map(a=>Object.freeze({id:a.id,weight:a.id===best.id?1:0})));
}
