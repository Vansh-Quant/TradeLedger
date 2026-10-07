import type {Competition,CompetitionState} from "./competition.js";
import {authorizeCompetitionCapability,type CompetitionPrincipal,type CompetitionCapability} from "./competition-access.js";
export type ControlAction="start"|"pause"|"resume"|"complete"|"halt"|"suspend_participant"|"resume_participant"|"liquidate_participant";
export interface ControlRequest{readonly requestId:string;readonly principal:CompetitionPrincipal;readonly action:ControlAction;readonly expectedVersion:number;readonly participantId?:string;}
export interface ControlDecision{readonly allowed:boolean;readonly reason:string;readonly capability:CompetitionCapability;readonly expectedVersion:number;}
const ACTION_CAPABILITY:Readonly<Record<ControlAction,CompetitionCapability>>={
 start:"competition.start",pause:"competition.pause",resume:"competition.resume",complete:"competition.complete",halt:"competition.halt",
 suspend_participant:"participant.suspend",resume_participant:"participant.resume",liquidate_participant:"participant.liquidate"
};
const allowedState:Readonly<Record<ControlAction,readonly CompetitionState[]>>={
 start:["ready"],pause:["live"],resume:["halted"],complete:["live","halted"],halt:["live"],suspend_participant:["live","halted"],resume_participant:["live","halted"],liquidate_participant:["live","halted"]
};
export function authorizeCompetitionControl(c:Competition,r:ControlRequest):ControlDecision{
  if(r.expectedVersion!==c.version)return Object.freeze({allowed:false,reason:"stale competition version",capability:ACTION_CAPABILITY[r.action],expectedVersion:c.version});
  const capability=ACTION_CAPABILITY[r.action];
  const access=authorizeCompetitionCapability(r.principal,capability);
  if(!access.allowed)return Object.freeze({allowed:false,reason:access.reason,capability,expectedVersion:c.version});
  if(!allowedState[r.action].includes(c.state))return Object.freeze({allowed:false,reason:"invalid competition state for action",capability,expectedVersion:c.version});
  if((r.action==="suspend_participant"||r.action==="resume_participant"||r.action==="liquidate_participant")&&!r.participantId)return Object.freeze({allowed:false,reason:"participantId required",capability,expectedVersion:c.version});
  return Object.freeze({allowed:true,reason:"allowed",capability,expectedVersion:c.version});
}
