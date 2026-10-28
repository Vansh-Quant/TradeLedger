import type { AccountContext, Order } from "@/api/types";
import { money } from "./format";

/**
 * JARVIS reads the backend state already loaded by the workstation and routes
 * the user. It never calculates P&L, risk or prices, never admits orders and
 * never claims a capability the backend does not expose.
 */

export interface JarvisState {
  /** True when at least one backend read succeeded. */
  reachable: boolean;
  context?: AccountContext | undefined;
  orders?: Order[] | undefined;
}

export type JarvisDestination =
  { to: "/positions" } | { to: "/risk" } | { to: "/trading"; symbol: string };

export interface JarvisReply {
  text: string;
  destination?: JarvisDestination;
}

/** Suggestions are limited to intents this build can actually answer. */
export const JARVIS_SUGGESTIONS = [
  "Show my positions",
  "What's my current exposure?",
  "Show my risk",
  "Why was this order rejected?",
  "Summarize today's trading",
  "Analyze AAPL",
] as const;

export const JARVIS_DISCLOSURE =
  "No language model or agent tools are connected. JARVIS answers from the account and order state already loaded, and cannot place orders or change limits.";

function unavailable(): JarvisReply {
  return {
    text: "I can't reach the TradeLedger API yet, so I have no backend state to read. Configure the connection in Settings.",
  };
}

function positions(state: JarvisState): JarvisReply {
  const held = state.context?.positions ?? [];
  if (held.length === 0) {
    return { text: "The backend context reports no open positions." };
  }
  const symbols = held.map((position) => position.symbol).join(", ");
  return {
    text: `You hold ${held.length} position(s): ${symbols}. Opened Positions.`,
    destination: { to: "/positions" },
  };
}

function exposure(state: JarvisState): JarvisReply {
  const c = state.context;
  if (!c) return unavailable();
  return {
    text: `Gross exposure ${money(c.grossExposure)}, net exposure ${money(c.netExposure)}. Values are reported by the backend; I do not compute exposure.`,
  };
}

function rejected(state: JarvisState): JarvisReply {
  const orders = state.orders ?? [];
  const rejectedOrder = orders.find((order) => String(order.status).toUpperCase() === "REJECTED");
  if (!rejectedOrder) {
    return { text: "No rejected orders are present in the order list returned by the backend." };
  }
  return {
    text: `Order ${rejectedOrder.orderId} (${rejectedOrder.side ?? "?"} ${rejectedOrder.symbol ?? "?"}) was rejected: ${rejectedOrder.rejectReason ?? "the backend did not provide a reason."}`,
  };
}

function summary(state: JarvisState): JarvisReply {
  const c = state.context;
  if (!c) return unavailable();
  const orderCount = state.orders?.length;
  const parts = [
    `Account ${c.accountId}`,
    `market value ${money(c.marketValue)}`,
    `realized P&L ${money(c.realizedPnl, true)}`,
    `unrealized P&L ${money(c.unrealizedPnl, true)}`,
    `${c.positions.length} position(s)`,
    orderCount === undefined ? "orders unavailable" : `${orderCount} order(s)`,
  ];
  return {
    text: `${parts.join(" · ")}. Equity, cash and executions are not exposed by the trading-context API, so I won't estimate them.`,
  };
}

function explain(question: string, state: JarvisState): JarvisReply {
  const orders = state.orders ?? [];
  const explicit = question.match(/order\s+([a-z0-9][a-z0-9_-]{1,})/i)?.[1];
  if (!explicit) {
    return {
      text: 'Which order? Include its order id, for example "explain order ORD-1234". I can only describe orders the backend has returned.',
    };
  }
  const order = orders.find(
    (candidate) => candidate.orderId.toLowerCase() === explicit.toLowerCase(),
  );
  if (!order) {
    return {
      text: `No order "${explicit}" is present in the ${orders.length} order(s) the backend returned.`,
    };
  }
  const price = order.limitPrice ?? order.stopPrice ?? order.averageFillPrice;
  return {
    text:
      [
        `Order ${order.orderId}: ${order.side ?? "?"} ${order.quantity ?? "?"} ${order.symbol ?? "?"}`,
        order.type ?? "?",
        order.status ?? "?",
        `filled ${order.filledQuantity ?? 0}`,
        price == null ? "no price on record" : `price ${price}`,
        order.createdAt ?? "",
      ]
        .filter(Boolean)
        .join(" · ") + ". This is the order record as returned by the backend.",
  };
}

function analyzeSymbol(question: string): JarvisReply | undefined {
  const match = question.match(/analy[sz]e\s+([a-z][a-z.-]{0,9})/i);
  if (!match?.[1]) return undefined;
  const symbol = match[1].toUpperCase();
  return {
    text: `Opened ${symbol} in Trading. Analysis agents are not connected, so I can show the instrument but cannot produce research or a recommendation.`,
    destination: { to: "/trading", symbol },
  };
}

export function answer(question: string, state: JarvisState): JarvisReply {
  const normalized = question.trim().toLowerCase();
  if (normalized === "")
    return { text: "Ask about positions, exposure, risk, orders or your trading summary." };
  if (!state.reachable) return unavailable();

  const analyzed = analyzeSymbol(question);
  if (analyzed) return analyzed;

  if (/\bpositions?\b/.test(normalized) || /\bholdings?\b/.test(normalized))
    return positions(state);
  if (/\bexposure\b/.test(normalized)) return exposure(state);
  if (/\brisk\b/.test(normalized) || /\blimits?\b/.test(normalized)) {
    return {
      text: "Opened the Risk dashboard with backend-reported limits and utilisation.",
      destination: { to: "/risk" },
    };
  }
  if (/\breject/.test(normalized)) return rejected(state);
  if (/\bexplain\b/.test(normalized)) return explain(question, state);
  if (/\bsummari[sz]e\b/.test(normalized) || /\btoday\b/.test(normalized)) return summary(state);

  return {
    text: "That request needs an agent tool the backend does not expose yet. I can read positions, exposure, risk limits, orders and a trading summary from the current session.",
  };
}
