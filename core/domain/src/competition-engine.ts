import type {Competition} from "./competition.js";
import type {CompetitionPolicy} from "./competition-policy.js";
import {authorizeCompetitionOrder,type AuthorityDecision, type AuthorityContext} from "./competition-authority.js";
import {buildCompetitionLeaderboard,type LeaderboardEntry,type ParticipantPerformance} from "./competition-leaderboard.js";
export interface CompetitionEngineState { readonly competition:Competition; readonly performance:readonly ParticipantPerformance[]; readonly orderCounts:Readonly<Record<string,number>>; readonly second:number; }
export function createCompetitionEngineState(competition:Competition):CompetitionEngineState{
  return Object.freeze({competition,performance:Object.freeze(competition.participants.map(p=>Object.freeze({participantId:p.participantId,startingEquity:competition.config.startingEquity,realizedPnl:0,unrealizedPnl:0}))),orderCounts:Object.freeze({}),second:0});
}
export function authorizeCompetitionOrderWithState(state:CompetitionEngineState,input:Omit<AuthorityContext,"ordersInCurrentSecond">&{readonly second:number},policy?:CompetitionPolicy):{readonly state:CompetitionEngineState;readonly decision:AuthorityDecision}{
  const counts=input.second===state.second?state.orderCounts:{};
  const count=counts[input.participantId]??0;
  const decision=authorizeCompetitionOrder(state.competition,{...input,ordersInCurrentSecond:count},policy);
  if(!decision.allowed)return Object.freeze({state,decision});
  return Object.freeze({state:Object.freeze({...state,orderCounts:Object.freeze({...counts,[input.participantId]:count+1}),second:input.second}),decision});
}
export function updateParticipantPerformance(state:CompetitionEngineState,participantId:string,realizedPnl:number,unrealizedPnl:number):CompetitionEngineState{
  if(!Number.isFinite(realizedPnl)||!Number.isFinite(unrealizedPnl))throw new Error("P&L must be finite");
  const found=state.performance.some(p=>p.participantId===participantId);
  if(!found)throw new Error("participant not found");
  return Object.freeze({...state,performance:Object.freeze(state.performance.map(p=>p.participantId===participantId?Object.freeze({...p,realizedPnl,unrealizedPnl}):p))});
}
export function competitionLeaderboard(state:CompetitionEngineState):readonly LeaderboardEntry[]{return buildCompetitionLeaderboard(state.performance);}
