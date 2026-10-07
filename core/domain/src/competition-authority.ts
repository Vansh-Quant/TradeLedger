import type {Competition} from "./competition.js";
export type AuthorityDecisionReason="allowed"|"competition_not_live"|"participant_not_found"|"participant_not_active"|"instrument_not_allowed"|"order_notional_limit"|"participant_rate_limit";
export interface AuthorityDecision { readonly allowed:boolean; readonly reason:AuthorityDecisionReason; readonly sequence:number; }
export interface AuthorityContext { readonly participantId:string; readonly instrumentId:string; readonly orderNotional:number; readonly ordersInCurrentSecond:number; }
export function authorizeCompetitionOrder(c:Competition,input:AuthorityContext):AuthorityDecision{
  const base={sequence:c.sequence};
  if(c.state!=="live")return Object.freeze({allowed:false,reason:"competition_not_live",...base});
  const p=c.participants.find(x=>x.participantId===input.participantId);
  if(!p)return Object.freeze({allowed:false,reason:"participant_not_found",...base});
  if(p.state!=="active")return Object.freeze({allowed:false,reason:"participant_not_active",...base});
  if(!c.config.allowedInstruments.includes(input.instrumentId))return Object.freeze({allowed:false,reason:"instrument_not_allowed",...base});
  if(!Number.isFinite(input.orderNotional)||input.orderNotional<=0||input.orderNotional>c.config.maxOrderNotional)return Object.freeze({allowed:false,reason:"order_notional_limit",...base});
  if(input.ordersInCurrentSecond>=c.config.maxOrdersPerParticipantPerSecond)return Object.freeze({allowed:false,reason:"participant_rate_limit",...base});
  return Object.freeze({allowed:true,reason:"allowed",...base});
}
