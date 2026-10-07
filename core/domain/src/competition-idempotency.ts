export interface IdempotencyRecord{readonly requestId:string;readonly fingerprint:string;readonly sequence:number;readonly accepted:boolean;}
export interface IdempotencyState{readonly records:ReadonlyMap<string,IdempotencyRecord>;}
export function createIdempotencyState():IdempotencyState{return Object.freeze({records:new Map()});}
export type IdempotencyResult={readonly duplicate:boolean;readonly conflict:boolean;readonly state:IdempotencyState;readonly record:IdempotencyRecord};
export function acceptIdempotentRequest(state:IdempotencyState,requestId:string,fingerprint:string,sequence:number,accepted:boolean):IdempotencyResult{
 if(!requestId.trim()||!fingerprint.trim())throw new Error("requestId and fingerprint must not be empty");
 const existing=state.records.get(requestId);
 if(existing){
   if(existing.fingerprint!==fingerprint)throw new Error("idempotency requestId fingerprint conflict");
   return Object.freeze({duplicate:true,conflict:false,state,record:existing});
 }
 const record=Object.freeze({requestId,fingerprint,sequence,accepted});
 const records=new Map(state.records);records.set(requestId,record);
 return Object.freeze({duplicate:false,conflict:false,state:Object.freeze({records}),record});
}
