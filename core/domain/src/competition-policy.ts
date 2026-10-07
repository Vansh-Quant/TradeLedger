export interface CompetitionPolicy{
 readonly version:number; readonly tradingEnabled:boolean; readonly emergencyHalt:boolean;
 readonly allowedInstruments:readonly string[]; readonly maxOrderNotional:number;
 readonly maxOrdersPerParticipantPerSecond:number;
}
export function createCompetitionPolicy(input:Omit<CompetitionPolicy,"version">,version=1):CompetitionPolicy{
 if(!Number.isInteger(version)||version<1)throw new Error("version must be a positive integer");
 if(input.allowedInstruments.length===0)throw new Error("allowedInstruments must not be empty");
 if(!Number.isFinite(input.maxOrderNotional)||input.maxOrderNotional<=0)throw new Error("maxOrderNotional must be positive");
 if(!Number.isInteger(input.maxOrdersPerParticipantPerSecond)||input.maxOrdersPerParticipantPerSecond<1)throw new Error("maxOrdersPerParticipantPerSecond must be a positive integer");
 return Object.freeze({...input,version});
}
export function updateCompetitionPolicy(current:CompetitionPolicy,patch:Partial<Omit<CompetitionPolicy,"version">>):CompetitionPolicy{
 const next={...current,...patch,version:current.version+1};
 return createCompetitionPolicy(next,next.version);
}
