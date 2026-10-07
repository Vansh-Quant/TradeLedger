export interface AttributionEntry {
  readonly id:string;
  readonly pnl:number;
  readonly contributionPct:number;
}
export function attributePnl(entries: readonly {readonly id:string;readonly pnl:number}[], totalPnl?:number): readonly AttributionEntry[] {
  const total=totalPnl??entries.reduce((s,e)=>s+e.pnl,0);
  if(entries.length===0) return Object.freeze([]);
  return Object.freeze(entries.map(e=>Object.freeze({id:e.id,pnl:e.pnl,contributionPct:total===0?0:e.pnl/total})));
}
