export type Matrix = readonly (readonly number[])[];

export function covarianceMatrix(returnsByAsset: Readonly<Record<string, readonly number[]>>): Matrix {
  const ids=Object.keys(returnsByAsset);
  if(ids.length===0) return Object.freeze([]);
  const n=Math.min(...ids.map(id=>returnsByAsset[id]!.length));
  if(n<2) throw new Error("each asset requires at least two returns");
  const means=new Map(ids.map(id=>[id,returnsByAsset[id]!.slice(0,n).reduce((s,x)=>s+x,0)/n]));
  const rows=ids.map(a=>ids.map(b=>{
    const ar=returnsByAsset[a]!.slice(0,n), br=returnsByAsset[b]!.slice(0,n);
    return ar.reduce((s,x,i)=>s+(x-means.get(a)!)*(br[i]!-means.get(b)!),0)/(n-1);
  }));
  return Object.freeze(rows.map(row=>Object.freeze(row)));
}

export function correlationMatrix(returnsByAsset: Readonly<Record<string, readonly number[]>>): Matrix {
  const cov=covarianceMatrix(returnsByAsset);
  return Object.freeze(cov.map((row,i)=>Object.freeze(row.map((value,j)=>{
    const denominator=Math.sqrt(Math.max(cov[i]![i]!,0)*Math.max(cov[j]![j]!,0));
    return denominator===0?0:value/denominator;
  }))));
}
