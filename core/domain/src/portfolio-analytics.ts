export interface PortfolioAnalytics {
  readonly meanReturn: number;
  readonly volatility: number;
  readonly downsideDeviation: number;
  readonly sharpe: number;
  readonly sortino: number;
  readonly maxDrawdown: number;
  readonly calmar: number;
  readonly beta: number;
  readonly alpha: number;
  readonly correlation: number;
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((s,x)=>s+x,0)/values.length;
}
function variance(values: readonly number[], m: number): number {
  return values.length < 2 ? 0 : values.reduce((s,x)=>s+(x-m)**2,0)/(values.length-1);
}
function aligned(a: readonly number[], b: readonly number[]): [number[],number[]] {
  const n=Math.min(a.length,b.length);
  return [a.slice(0,n),b.slice(0,n)];
}

export function analyzePortfolioReturns(
  returns: readonly number[],
  benchmarkReturns: readonly number[] = [],
  riskFreeRate = 0,
): PortfolioAnalytics {
  if (returns.length === 0) throw new Error("returns must not be empty");
  const m=mean(returns);
  const vol=Math.sqrt(variance(returns,m));
  const excess=returns.map(x=>x-riskFreeRate);
  const downside=returns.filter(x=>x<riskFreeRate).map(x=>x-riskFreeRate);
  const dd=Math.sqrt(mean(downside.map(x=>x*x)));
  const sharpe=vol===0?0:(m-riskFreeRate)/vol;
  const sortino=dd===0?0:(m-riskFreeRate)/dd;
  let peak=1, equity=1, maxDd=0;
  for(const r of returns){ equity*=1+r; peak=Math.max(peak,equity); maxDd=Math.max(maxDd,(peak-equity)/peak); }
  const calmar=maxDd===0?0:m/maxDd;
  let beta=0, alpha=m, correlation=0;
  if(benchmarkReturns.length>0){
    const [p,b]=aligned(returns,benchmarkReturns);
    const pm=mean(p), bm=mean(b);
    const cov=p.length<2?0:p.reduce((s,x,i)=>s+(x-pm)*(b[i]!-bm),0)/(p.length-1);
    const bv=variance(b,bm), pv=variance(p,pm);
    beta=bv===0?0:cov/bv;
    alpha=m-beta*bm-riskFreeRate*(1-beta);
    correlation=(pv===0||bv===0)?0:cov/Math.sqrt(pv*bv);
  }
  return Object.freeze({meanReturn:m,volatility:vol,downsideDeviation:dd,sharpe,sortino,maxDrawdown:maxDd,calmar,beta,alpha,correlation});
}
