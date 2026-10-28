import { describe, expect, it } from "vitest";
import { answer, JARVIS_SUGGESTIONS, type JarvisState } from "@/lib/jarvis";
import type { AccountContext, Order } from "@/api/types";

const context: AccountContext = {
  accountId: "ACC-APP",
  marketValue: 21_128.5,
  grossExposure: 21_128.5,
  netExposure: 13_642.25,
  realizedPnl: 625.35,
  unrealizedPnl: -12.5,
  buyingPower: 100_000,
  positions: [
    { symbol: "AAPL", quantity: 80, averagePrice: 100.25 },
    { symbol: "NVDA", quantity: -20, averagePrice: 151.2 },
  ],
  executions: [],
  limits: {},
  raw: {},
};

const orders: Order[] = [
  {
    orderId: "ORD-1",
    symbol: "AAPL",
    side: "BUY",
    type: "LIMIT",
    quantity: 25,
    filledQuantity: 0,
    limitPrice: 103.5,
    timeInForce: "DAY",
    status: "REJECTED",
    rejectReason: "max order notional exceeded",
    createdAt: "2026-10-06T14:18:00.000Z",
  },
  {
    orderId: "ORD-2",
    symbol: "MSFT",
    side: "SELL",
    type: "LIMIT",
    quantity: 10,
    status: "SUBMITTED",
  },
];

const reachable: JarvisState = { reachable: true, context, orders };

describe("JARVIS responder", () => {
  it("refuses to answer without backend state", () => {
    const reply = answer("Show my positions", { reachable: false });
    expect(reply.text).toContain("can't reach the TradeLedger API");
    expect(reply.destination).toBeUndefined();
  });

  it("answers positions from backend state and routes to the page", () => {
    const reply = answer("Show my positions", reachable);
    expect(reply.text).toContain("2 position(s)");
    expect(reply.text).toContain("AAPL");
    expect(reply.destination).toEqual({ to: "/positions" });
  });

  it("does not invent positions for an empty account", () => {
    const reply = answer("Show my positions", {
      reachable: true,
      context: { ...context, positions: [] },
      orders: [],
    });
    expect(reply.text).toContain("no open positions");
    expect(reply.destination).toBeUndefined();
  });

  it("reports exposure using backend values only", () => {
    const reply = answer("What's my current exposure?", reachable);
    expect(reply.text).toContain("$21,128.50");
    expect(reply.text).toContain("$13,642.25");
    expect(reply.text).toContain("reported by the backend");
  });

  it("surfaces the backend rejection reason", () => {
    const reply = answer("Why was this order rejected?", reachable);
    expect(reply.text).toContain("ORD-1");
    expect(reply.text).toContain("max order notional exceeded");
  });

  it("does not claim a rejection when none exists", () => {
    const reply = answer("Why was this order rejected?", {
      reachable: true,
      context,
      orders: [orders[1] as Order],
    });
    expect(reply.text).toContain("No rejected orders");
  });

  it("asks for an order id instead of dead-ending on 'explain this order'", () => {
    const reply = answer("Explain this order", reachable);
    expect(reply.text).toContain("Which order?");
    expect(reply.text).not.toContain("agent tool");
  });

  it("describes a real order record when one is named", () => {
    const reply = answer("explain order ORD-1", reachable);
    expect(reply.text).toContain("ORD-1");
    expect(reply.text).toContain("REJECTED");
    expect(reply.text).toContain("103.5");
  });

  it("reports an unknown order id without fabricating one", () => {
    const reply = answer("explain order ORD-999", reachable);
    expect(reply.text).toContain('No order "ORD-999"');
  });

  it("never estimates equity, cash or executions in a summary", () => {
    const reply = answer("Summarize today's trading", reachable);
    expect(reply.text).toContain("ACC-APP");
    expect(reply.text).toContain("2 order(s)");
    expect(reply.text).toContain("not exposed");
    expect(reply.text).not.toContain("execution(s)");
  });

  it("routes an analysis request but discloses that no agent is connected", () => {
    const reply = answer("Analyze AAPL", reachable);
    expect(reply.destination).toEqual({ to: "/trading", symbol: "AAPL" });
    expect(reply.text).toContain("Analysis agents are not connected");
  });

  it("states the limitation for unsupported requests", () => {
    const reply = answer("Place a market order for 100 TSLA", reachable);
    expect(reply.text).toContain("does not expose yet");
  });

  it("answers every built-in suggestion without a dead end", () => {
    for (const suggestion of JARVIS_SUGGESTIONS) {
      const reply = answer(suggestion, reachable);
      expect(reply.text, suggestion).not.toContain("needs an agent tool");
      expect(reply.text.length, suggestion).toBeGreaterThan(0);
    }
  });
});
