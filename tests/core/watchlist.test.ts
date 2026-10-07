import { describe, expect, it } from "vitest";
import { addToWatchlist, createWatchlist, removeFromWatchlist, reorderWatchlist, type InstrumentId } from "../../core/domain/src/index.js";
const A="AAPL" as InstrumentId, B="MSFT" as InstrumentId;
describe("watchlist",()=>{it("adds, removes and reorders instruments",()=>{let w=createWatchlist("WL-1","Core");w=addToWatchlist(w,{instrumentId:A,addedAt:"2026-10-07T10:00:00Z"});w=addToWatchlist(w,{instrumentId:B,addedAt:"2026-10-07T10:01:00Z"});expect(w.items.map(x=>x.instrumentId)).toEqual([A,B]);w=reorderWatchlist(w,[B,A]);expect(w.items.map(x=>x.instrumentId)).toEqual([B,A]);w=removeFromWatchlist(w,A);expect(w.items[0]?.rank).toBe(0);});it("rejects invalid reorder",()=>expect(()=>reorderWatchlist(createWatchlist("WL","x"),[A])).toThrow());});
