export type FactorName = "momentum"|"value"|"volatility"|"quality"|"size";
export interface FactorScore { readonly instrumentId:string; readonly factor:FactorName; readonly score:number; }

export function zScoreCrossSection(values: readonly {readonly instrumentId:string;readonly value:number}[]): readonly {readonly instrumentId:string;readonly score:number}[] {
  if(values.length===0) return Object.freeze([]);
  const mean=values.reduce((s,x)=>s+x.value,0)/values.length;
  const std=Math.sqrt(values.reduce((s,x)=>s+(x.value-mean)**2,0)/values.length);
  return Object.freeze(values.map(x=>Object.freeze({instrumentId:x.instrumentId,score:std===0?0:(x.value-mean)/std})));
}

export function rankFactor(values: readonly {readonly instrumentId:string;readonly value:number}[], higherIsBetter=true): readonly {readonly instrumentId:string;readonly rank:number}[] {
  const sorted=[...values].sort((a,b)=>higherIsBetter?b.value-a.value:a.value-b.value);
  return Object.freeze(sorted.map((x,i)=>Object.freeze({instrumentId:x.instrumentId,rank:i+1})));
}

export function compositeFactorScore(
  factors: readonly FactorScore[],
  weights: Readonly<Partial<Record<FactorName,number>>>,
): readonly {readonly instrumentId:string;readonly score:number}[] {
  const by=new Map<string,number>();
  const total=Object.values(weights).reduce((s,x)=>s+(x??0),0);
  if(total<=0) throw new Error("factor weights must have positive total");
  for(const f of factors) by.set(f.instrumentId,(by.get(f.instrumentId)??0)+(factors.filter(x=>x.instrumentId===f.instrumentId).reduce((s,x)=>s+(weights[x.factor]??0)*x.score,0))/total);
  return Object.freeze([...by].map(([instrumentId,score])=>Object.freeze({instrumentId,score})));
}
