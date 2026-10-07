export const COMPETITION_ROLES=["owner","operator","risk_officer","judge","observer","participant"] as const;
export type CompetitionRole=(typeof COMPETITION_ROLES)[number];
export const COMPETITION_CAPABILITIES=[
  "competition.view","competition.register","competition.start","competition.pause","competition.resume",
  "competition.complete","competition.halt","participant.suspend","participant.resume",
  "participant.liquidate","policy.update","instrument.update","leaderboard.view","audit.view"
] as const;
export type CompetitionCapability=(typeof COMPETITION_CAPABILITIES)[number];
const ROLE_CAPABILITIES:Readonly<Record<CompetitionRole,readonly CompetitionCapability[]>>=Object.freeze({
  owner:COMPETITION_CAPABILITIES,
  operator:["competition.view","competition.start","competition.pause","competition.resume","competition.complete","competition.halt","participant.suspend","participant.resume","participant.liquidate","instrument.update","leaderboard.view","audit.view"],
  risk_officer:["competition.view","competition.halt","participant.suspend","participant.resume","participant.liquidate","policy.update","leaderboard.view","audit.view"],
  judge:["competition.view","leaderboard.view","audit.view"],
  observer:["competition.view","leaderboard.view"],
  participant:["competition.view","competition.register","leaderboard.view"],
});
export interface CompetitionPrincipal{readonly principalId:string;readonly roles:readonly CompetitionRole[];readonly disabled:boolean;}
export interface AccessDecision{readonly allowed:boolean;readonly reason:"allowed"|"principal_disabled"|"missing_capability";readonly capability:CompetitionCapability;}
export function authorizeCompetitionCapability(principal:CompetitionPrincipal,capability:CompetitionCapability):AccessDecision{
  if(!principal.principalId.trim())throw new Error("principalId must not be empty");
  if(principal.disabled)return Object.freeze({allowed:false,reason:"principal_disabled",capability});
  const allowed=principal.roles.some(role=>ROLE_CAPABILITIES[role].includes(capability));
  return Object.freeze({allowed,reason:allowed?"allowed":"missing_capability",capability});
}
export function capabilitiesForRole(role:CompetitionRole):readonly CompetitionCapability[]{return Object.freeze([...ROLE_CAPABILITIES[role]]);}
