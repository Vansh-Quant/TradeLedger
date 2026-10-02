import { describe, expect, it } from "vitest";
import {
  createMarketDataSubscription,
  createProviderHealth,
  type InstrumentId,
  type MarketDataPoint,
  type MarketDataProvider,
} from "../../core/domain/src/index.js";

const AAPL = "AAPL" as InstrumentId;

function provider(): MarketDataProvider {
  return {
    providerId: "test-feed",
    capabilities: {
      quotes: true,
      trades: true,
      bars: true,
      historical: true,
    },
    async subscribe(_subscription, _onData) {},
    async unsubscribe(_subscriptionId) {},
    async historical() {
      return [] as readonly MarketDataPoint[];
    },
    async health() {
      return createProviderHealth({
        providerId: "test-feed",
        healthy: true,
        checkedAt: "2026-10-02T10:00:00Z",
      });
    },
  };
}

describe("market data provider contract", () => {
  it("creates a normalized subscription", () => {
    const subscription = createMarketDataSubscription({
      subscriptionId: "sub-1",
      instruments: [AAPL, AAPL],
      kinds: ["quote", "trade", "quote"],
    });

    expect(subscription.subscriptionId).toBe("sub-1");
    expect(subscription.instruments).toEqual([AAPL]);
    expect(subscription.kinds).toEqual(["quote", "trade"]);
    expect(Object.isFrozen(subscription)).toBe(true);
  });

  it("rejects an empty subscription id", () => {
    expect(() =>
      createMarketDataSubscription({
        subscriptionId: " ",
        instruments: [AAPL],
        kinds: ["quote"],
      }),
    ).toThrow("subscriptionId must not be empty");
  });

  it("rejects an empty instrument set", () => {
    expect(() =>
      createMarketDataSubscription({
        subscriptionId: "sub-1",
        instruments: [],
        kinds: ["quote"],
      }),
    ).toThrow("instruments must not be empty");
  });

  it("rejects an empty kind set", () => {
    expect(() =>
      createMarketDataSubscription({
        subscriptionId: "sub-1",
        instruments: [AAPL],
        kinds: [],
      }),
    ).toThrow("kinds must not be empty");
  });

  it("creates provider health", () => {
    const health = createProviderHealth({
      providerId: "feed-a",
      healthy: true,
      checkedAt: "2026-10-02T10:00:00Z",
      message: "connected",
    });

    expect(health.healthy).toBe(true);
    expect(health.message).toBe("connected");
    expect(Object.isFrozen(health)).toBe(true);
  });

  it("omits empty health messages", () => {
    const health = createProviderHealth({
      providerId: "feed-a",
      healthy: false,
      checkedAt: "2026-10-02T10:00:00Z",
      message: " ",
    });

    expect("message" in health).toBe(false);
  });

  it("rejects invalid health timestamps", () => {
    expect(() =>
      createProviderHealth({
        providerId: "feed-a",
        healthy: false,
        checkedAt: "not-a-date",
      }),
    ).toThrow("checkedAt must be a valid timestamp");
  });

  it("defines subscription, historical and health provider capabilities", async () => {
    const p = provider();
    expect(p.providerId).toBe("test-feed");
    expect(p.capabilities.historical).toBe(true);
    await expect(p.historical(AAPL, "bar", "2026-10-02T10:00:00Z", "2026-10-02T11:00:00Z")).resolves.toEqual([]);
    await expect(p.health()).resolves.toMatchObject({ healthy: true });
  });
});
