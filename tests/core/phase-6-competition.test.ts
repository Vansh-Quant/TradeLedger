import {describe,expect,it} from "vitest";
import {
 authorizeCompetitionCapability,authorizeCompetitionControl,buildCompetitionLeaderboard,
 createCompetition,createCompetitionEngineState,createCompetitionPolicy,createIdempotencyState,authorizeCompetitionRegistration,
 registerCompetitionParticipant,openCompetitionRegistration,prepareCompetition,startCompetition,
 suspendParticipant,authorizeCompetitionOrder,acceptIdempotentRequest,updateCompetitionPolicy
} from "@tradeledger/domain";

const baseConfig={id:"COMP-001",name:"TradeLedger Challenge",maxParticipants:1000,allowedInstruments:["AAPL","NVDA"],maxOrderNotional:10000,maxOrdersPerParticipantPerSecond:5,startingEquity:100000};

function liveCompetition(){
 let c=createCompetition(baseConfig,"2026-10-07T00:00:00Z");
 c=openCompetitionRegistration(c);
 c=registerCompetitionParticipant(c,{participantId:"P-1",accountId:"ACC-1",state:"registered",registeredAt:"2026-10-07T00:00:00Z"});
 c=prepareCompetition(c);
 return startCompetition(c);
}

describe("phase 6 competition hardening",()=>{
 it("supports the full 1000 participant capacity deterministically",()=>{
  let c=createCompetition(baseConfig,"2026-10-07T00:00:00Z");
  c=openCompetitionRegistration(c);
  for(let i=0;i<1000;i++) c=registerCompetitionParticipant(c,{participantId:`P-${i}`,accountId:`ACC-${i}`,state:"registered",registeredAt:"2026-10-07T00:00:00Z"});
  expect(c.participants).toHaveLength(1000);
  expect(()=>registerCompetitionParticipant(c,{participantId:"P-1000",accountId:"ACC-1000",state:"registered",registeredAt:"2026-10-07T00:00:00Z"})).toThrow("capacity");
 });

 it("enforces role capability boundaries and disabled principals",()=>{
  const observer={principalId:"judge-1",roles:["judge"] as const,disabled:false};
  expect(authorizeCompetitionCapability(observer,"competition.view").allowed).toBe(true);
  expect(authorizeCompetitionCapability(observer,"competition.start").allowed).toBe(false);
  expect(authorizeCompetitionCapability({...observer,disabled:true},"competition.view").reason).toBe("principal_disabled");
 });

 it("rejects stale control requests before applying privileged actions",()=>{
  const c=liveCompetition();
  const operator={principalId:"op-1",roles:["operator"] as const,disabled:false};
  const request={requestId:"REQ-1",principal:operator,action:"halt" as const,expectedVersion:c.version};
  expect(authorizeCompetitionControl(c,request).allowed).toBe(true);
  expect(authorizeCompetitionControl(c,{...request,expectedVersion:c.version-1}).reason).toBe("stale competition version");
 });

 it("enforces authority before trading and participant suspension",()=>{
  const c=suspendParticipant(liveCompetition(),"P-1");
  expect(authorizeCompetitionOrder(c,{participantId:"P-1",instrumentId:"AAPL",orderNotional:100,ordersInCurrentSecond:0}).reason).toBe("participant_not_active");
  expect(authorizeCompetitionOrder(c,{participantId:"missing",instrumentId:"AAPL",orderNotional:100,ordersInCurrentSecond:0}).reason).toBe("participant_not_found");
  const live=liveCompetition();
  expect(authorizeCompetitionOrder(live,{participantId:"P-1",instrumentId:"BTC",orderNotional:100,ordersInCurrentSecond:0}).reason).toBe("instrument_not_allowed");
  expect(authorizeCompetitionOrder(live,{participantId:"P-1",instrumentId:"AAPL",orderNotional:100,ordersInCurrentSecond:5}).reason).toBe("participant_rate_limit");
  expect(authorizeCompetitionOrder(live,{participantId:"P-1",instrumentId:"AAPL",orderNotional:100,ordersInCurrentSecond:0}).allowed).toBe(true);
 });

 it("makes idempotency immutable and detects request fingerprint conflicts",()=>{
  const s=createIdempotencyState();
  const a=acceptIdempotentRequest(s,"REQ-1","fingerprint-a",1,true);
  const b=acceptIdempotentRequest(a.state,"REQ-1","fingerprint-a",1,true);
  expect(b.duplicate).toBe(true);
  expect(()=>acceptIdempotentRequest(a.state,"REQ-1","fingerprint-b",2,true)).toThrow("fingerprint conflict");
  expect(a.state.records["REQ-1"]!.sequence).toBe(1);
 });

 it("blocks emergency-halted and policy-disabled trading",()=>{
  const live=liveCompetition();
  const emergency=createCompetitionPolicy({tradingEnabled:true,emergencyHalt:true,allowedInstruments:["AAPL"],maxOrderNotional:1000,maxOrdersPerParticipantPerSecond:5});
  expect((authorizeCompetitionOrder(live,{participantId:"P-1",instrumentId:"AAPL",orderNotional:100,ordersInCurrentSecond:0},emergency)).reason).toBe("emergency_halt");
  const disabled=createCompetitionPolicy({tradingEnabled:false,emergencyHalt:false,allowedInstruments:["AAPL"],maxOrderNotional:1000,maxOrdersPerParticipantPerSecond:5});
  expect((authorizeCompetitionOrder(live,{participantId:"P-1",instrumentId:"AAPL",orderNotional:100,ordersInCurrentSecond:0},disabled)).reason).toBe("trading_disabled");
 });

 it("versions policy changes so stale control cannot silently use old rules",()=>{
  const p=createCompetitionPolicy({tradingEnabled:true,emergencyHalt:false,allowedInstruments:["AAPL"],maxOrderNotional:1000,maxOrdersPerParticipantPerSecond:5});
  const next=updateCompetitionPolicy(p,{emergencyHalt:true});
  expect(next.version).toBe(2);
  expect(next.emergencyHalt).toBe(true);
 });

 it("keeps leaderboard deterministic with stable tie breaking",()=>{
  const rows=[{participantId:"P-2",startingEquity:100,realizedPnl:5,unrealizedPnl:0},{participantId:"P-1",startingEquity:100,realizedPnl:5,unrealizedPnl:0}];
  expect(buildCompetitionLeaderboard(rows).map(x=>x.participantId)).toEqual(["P-1","P-2"]);
 });

 it("requires registration capability before participant registration",()=>{
  expect(authorizeCompetitionRegistration({principalId:"p",roles:["observer"],disabled:false}).allowed).toBe(false);
  expect(authorizeCompetitionRegistration({principalId:"p",roles:["participant"],disabled:false}).allowed).toBe(true);
 });

 it("creates isolated engine state for registered participants",()=>{
  const state=createCompetitionEngineState(liveCompetition());
  expect(state.performance).toHaveLength(1);
  expect(state.performance[0]!.participantId).toBe("P-1");
 });
});
