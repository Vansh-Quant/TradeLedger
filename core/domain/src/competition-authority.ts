import type {Competition} from "./competition.js";
import type {CompetitionPolicy} from "./competition-policy.js";
export type AuthorityDecisionReason="allowed"|"competition_not_live"|"emergency_halt"|"trading_disabled"|"participant_not_found"|"participant_not_active"|"instrument_not_allowed"|"order_notional_limit"|"participant_rate_limit";
export interface AuthorityDecision { readonly allowed:boolean; readonly reason:AuthorityDecisionReason; readonly sequence:number; readonly policyVersion?:number; }
export interface AuthorityContext { readonly participantId:string; readonly instrumentId:string; readonly orderNotional:number; readonly ordersInCurrentSecond:number; }
export function authorizeCompetitionOrder(c:Competition,input:AuthorityContext,policy?:CompetitionPolicy):AuthorityDecision{
  const base={sequence:c.sequence,...(policy===undefined?{}:{policyVersion:policy.version})};
  if(c.state!=="live")return Object.freeze({allowed:false,reason:"competition_not_live",...base});
  if(policy?.emergencyHalt)return Object.freeze({allowed:false,reason:"emergency_halt",...base});
  if(policy?.tradingEnabled===false)return Object.freeze({allowed:false,reason:"trading_disabled",...base});
  const instruments=policy?.allowedInstruments??c.config.allowedInstruments;
  const maxNotional=policy?.maxOrderNotional??c.config.maxOrderNotional;
  const maxRate=policy?.maxOrdersPerParticipantPerSecond??c.config.maxOrdersPerParticipantPerSecond;
  const p=c.participants.find(x=>x.participantId===input.participantId);
  if(!p)return Object.freeze({allowed:false,reason:"participant_not_found",...base});
  if(p.state!=="active")return Object.freeze({allowed:false,reason:"participant_not_active",...base});
  if(!instruments.includes(input.instrumentId))return Object.freeze({allowed:false,reason:"instrument_not_allowed",...base});
  if(!Number.isFinite(input.orderNotional)||input.orderNotional<=0||input.orderNotional>maxNotional)return Object.freeze({allowed:false,reason:"order_notional_limit",...base});
  if(input.ordersInCurrentSecond>=maxRate)return Object.freeze({allowed:false,reason:"participant_rate_limit",...base});
  return Object.freeze({allowed:true,reason:"allowed",...base});
}
