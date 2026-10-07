export const COMPETITION_STATES = ["draft","registration","ready","live","halted","completed","cancelled"] as const;
export type CompetitionState=(typeof COMPETITION_STATES)[number];
export const PARTICIPANT_STATES=["registered","active","suspended","disqualified","finished"] as const;
export type ParticipantState=(typeof PARTICIPANT_STATES)[number];

export interface CompetitionConfig {
  readonly id:string;
  readonly name:string;
  readonly maxParticipants:number;
  readonly allowedInstruments:readonly string[];
  readonly maxOrderNotional:number;
  readonly maxOrdersPerParticipantPerSecond:number;
  readonly startingEquity:number;
}
export interface CompetitionParticipant {
  readonly participantId:string;
  readonly accountId:string;
  readonly state:ParticipantState;
  readonly registeredAt:string;
}
export interface Competition {
  readonly config:CompetitionConfig;
  readonly state:CompetitionState;
  readonly participants:readonly CompetitionParticipant[];
  readonly version:number;
  readonly sequence:number;
}
function nonEmpty(v:string,n:string){if(!v.trim())throw new Error(n+" must not be empty");return v.trim();}
function positive(v:number,n:string){if(!Number.isFinite(v)||v<=0)throw new Error(n+" must be finite and positive");return v;}
export function createCompetition(config:CompetitionConfig,now:string):Competition{
  if(config.maxParticipants<1||config.maxParticipants>1000)throw new Error("maxParticipants must be between 1 and 1000");
  if(config.allowedInstruments.length===0)throw new Error("allowedInstruments must not be empty");
  positive(config.maxOrderNotional,"maxOrderNotional"); positive(config.startingEquity,"startingEquity");
  if(!Number.isInteger(config.maxOrdersPerParticipantPerSecond)||config.maxOrdersPerParticipantPerSecond<1)throw new Error("maxOrdersPerParticipantPerSecond must be a positive integer");
  const normalizedConfig = Object.freeze({...config,id:nonEmpty(config.id,"id"),name:nonEmpty(config.name,"name"),allowedInstruments:Object.freeze([...config.allowedInstruments])});
  return Object.freeze({config:normalizedConfig,state:"draft",participants:Object.freeze([]),version:0,sequence:0});
}
function evolve(c:Competition,state:CompetitionState,participants=c.participants):Competition{
  return Object.freeze({...c,state,participants:Object.freeze([...participants]),version:c.version+1,sequence:c.sequence+1});
}
export function openCompetitionRegistration(c:Competition):Competition{
  if(c.state!=="draft")throw new Error("registration can only open from draft");
  return evolve(c,"registration");
}
export function registerCompetitionParticipant(c:Competition,p:CompetitionParticipant):Competition{
  if(c.state!=="registration")throw new Error("participants can only register during registration");
  if(c.participants.length>=c.config.maxParticipants)throw new Error("competition participant capacity reached");
  if(c.participants.some(x=>x.participantId===p.participantId||x.accountId===p.accountId))throw new Error("participant or account already registered");
  return evolve(c,"registration",[...c.participants,Object.freeze({...p})]);
}
export function prepareCompetition(c:Competition):Competition{
  if(c.state!=="registration"||c.participants.length===0)throw new Error("competition requires registration and at least one participant");
  return evolve(c,"ready");
}
export function startCompetition(c:Competition):Competition{
  if(c.state!=="ready")throw new Error("competition can only start from ready");
  return evolve(c,"live",c.participants.map(p=>({...p,state:p.state==="registered"?"active":p.state})));
}
export function haltCompetition(c:Competition):Competition{
  if(c.state!=="live")throw new Error("only a live competition can be halted");
  return evolve(c,"halted");
}
export function resumeCompetition(c:Competition):Competition{
  if(c.state!=="halted")throw new Error("only a halted competition can resume");
  return evolve(c,"live");
}
export function completeCompetition(c:Competition):Competition{
  if(c.state!=="live"&&c.state!=="halted")throw new Error("competition must be live or halted to complete");
  return evolve(c,"completed",c.participants.map(p=>({...p,state:p.state==="active"?"finished":p.state})));
}
export function suspendParticipant(c:Competition,id:string):Competition{
  if(c.state!=="live"&&c.state!=="halted")throw new Error("participant controls require an active competition");
  const found=c.participants.some(p=>p.participantId===id);
  if(!found)throw new Error("participant not found");
  return evolve(c,c.state,c.participants.map(p=>p.participantId===id?{...p,state:"suspended"}:p));
}
export function resumeParticipant(c:Competition,id:string):Competition{
  if(c.state!=="live"&&c.state!=="halted")throw new Error("participant controls require an active competition");
  return evolve(c,c.state,c.participants.map(p=>p.participantId===id?{...p,state:"active"}:p));
}
