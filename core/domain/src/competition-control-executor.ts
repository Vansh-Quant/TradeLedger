import type {Competition} from "./competition.js";
import {completeCompetition,haltCompetition,prepareCompetition,registerCompetitionParticipant,resumeCompetition,resumeParticipant,startCompetition,suspendParticipant} from "./competition.js";
import {authorizeCompetitionControl,type ControlRequest} from "./competition-controls.js";
export interface AppliedControl{readonly competition:Competition;readonly applied:boolean;readonly reason:string;}
export function applyCompetitionControl(c:Competition,r:ControlRequest):AppliedControl{
 const decision=authorizeCompetitionControl(c,r);
 if(!decision.allowed)return Object.freeze({competition:c,applied:false,reason:decision.reason});
 switch(r.action){
  case "start": return Object.freeze({competition:startCompetition(c),applied:true,reason:"allowed"});
  case "pause":
  case "halt": return Object.freeze({competition:haltCompetition(c),applied:true,reason:"allowed"});
  case "resume": return Object.freeze({competition:resumeCompetition(c),applied:true,reason:"allowed"});
  case "complete": return Object.freeze({competition:completeCompetition(c),applied:true,reason:"allowed"});
  case "suspend_participant": return Object.freeze({competition:suspendParticipant(c,r.participantId!),applied:true,reason:"allowed"});
  case "resume_participant": return Object.freeze({competition:resumeParticipant(c,r.participantId!),applied:true,reason:"allowed"});
  case "liquidate_participant":
   return Object.freeze({competition:c,applied:false,reason:"liquidation requires the account/OMS execution adapter"});
 }
}
export function prepareCompetitionForControl(c:Competition):Competition{return prepareCompetition(c);}
