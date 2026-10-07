export type CompetitionAuditAction="control"|"order_authorization"|"participant_state_change"|"policy_change"|"competition_state_change";
export interface CompetitionAuditEvent{
 readonly eventId:string; readonly competitionId:string; readonly sequence:number; readonly occurredAt:string;
 readonly principalId:string; readonly action:CompetitionAuditAction; readonly targetId?:string;
 readonly outcome:"allowed"|"denied"|"applied"; readonly reason?:string; readonly requestId?:string;
 readonly policyVersion:number;
}
export function createCompetitionAuditEvent(input:CompetitionAuditEvent):CompetitionAuditEvent{
 if(!input.eventId.trim()||!input.competitionId.trim()||!input.principalId.trim()||!input.occurredAt.trim())throw new Error("audit identity fields must not be empty");
 if(!Number.isInteger(input.sequence)||input.sequence<0)throw new Error("audit sequence must be a non-negative integer");
 if(!Number.isInteger(input.policyVersion)||input.policyVersion<1)throw new Error("policyVersion must be a positive integer");
 return Object.freeze({...input});
}
export function appendCompetitionAudit(events:readonly CompetitionAuditEvent[],event:CompetitionAuditEvent):readonly CompetitionAuditEvent[]{
 if(events.some(e=>e.eventId===event.eventId))return events;
 const last=events[events.length-1];
 if(last&&event.sequence<=last.sequence)throw new Error("audit sequence must be strictly increasing");
 return Object.freeze([...events,event]);
}
