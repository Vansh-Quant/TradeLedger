import type {Competition,CompetitionParticipant} from "./competition.js";
import {registerCompetitionParticipant} from "./competition.js";
import {authorizeCompetitionRegistration,type CompetitionPrincipal} from "./competition-access.js";
export interface RegistrationResult{readonly registered:boolean;readonly competition:Competition;readonly reason:string;}
export function registerAuthorizedParticipant(c:Competition,principal:CompetitionPrincipal,participant:CompetitionParticipant):RegistrationResult{
 const access=authorizeCompetitionRegistration(principal);
 if(!access.allowed)return Object.freeze({registered:false,competition:c,reason:access.reason});
 return Object.freeze({registered:true,competition:registerCompetitionParticipant(c,participant),reason:"allowed"});
}
