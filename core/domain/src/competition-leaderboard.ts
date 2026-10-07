export interface LeaderboardEntry { readonly participantId:string; readonly rank:number; readonly realizedPnl:number; readonly unrealizedPnl:number; readonly totalPnl:number; readonly returnPct:number; }
export interface ParticipantPerformance { readonly participantId:string; readonly startingEquity:number; readonly realizedPnl:number; readonly unrealizedPnl:number; }
export function buildCompetitionLeaderboard(rows:readonly ParticipantPerformance[]):readonly LeaderboardEntry[]{
  const sorted=[...rows].sort((a,b)=>b.realizedPnl+b.unrealizedPnl-(a.realizedPnl+a.unrealizedPnl)||a.participantId.localeCompare(b.participantId));
  return Object.freeze(sorted.map((r,i)=>Object.freeze({participantId:r.participantId,rank:i+1,realizedPnl:r.realizedPnl,unrealizedPnl:r.unrealizedPnl,totalPnl:r.realizedPnl+r.unrealizedPnl,returnPct:(r.realizedPnl+r.unrealizedPnl)/r.startingEquity*100})));
}
