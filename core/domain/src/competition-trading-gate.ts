import type {Competition} from "./competition.js";
import {authorizeCompetitionOrder,type AuthorityContext,type AuthorityDecision} from "./competition-authority.js";
import {admitOrder,type OrderAdmissionInput,type OrderAdmissionResult} from "./order-admission.js";
export interface CompetitionOrderGateInput extends OrderAdmissionInput{readonly participantId:string;readonly instrumentId:string;readonly competition:Competition;readonly ordersInCurrentSecond:number;}
export interface CompetitionOrderGateResult{readonly authority:AuthorityDecision;readonly admission?:OrderAdmissionResult;}
export function admitCompetitionOrder(input:CompetitionOrderGateInput):CompetitionOrderGateResult{
 const authority=authorizeCompetitionOrder(input.competition,{participantId:input.participantId,instrumentId:input.instrumentId,orderNotional:input.orderNotional,ordersInCurrentSecond:input.ordersInCurrentSecond});
 if(!authority.allowed)return Object.freeze({authority});
 return Object.freeze({authority,admission:admitOrder(input)});
}
