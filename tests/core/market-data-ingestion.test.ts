import { describe, expect, it, vi } from "vitest";
import {
  ProviderMarketDataIngestion,
  createMarketDataSubscription,
  createQuote,
  type InstrumentId,
  type MarketDataPoint,
  type MarketDataProvider,
} from "../../core/domain/src/index.js";

const AAPL = "AAPL" as InstrumentId;

function makeProvider(): MarketDataProvider {
  return {
    providerId: "feed-a",
    capabilities: { quotes: true, trades: true, bars: true, historical: true },
    subscribe: vi.fn(async (_subscription, onData) => {
      await onData(
        createQuote({
          instrumentId: AAPL,
          bid: 100,
          bidSize: 10,
          ask: 100.25,
          askSize: 10,
          observedAt: "2026-10-02T10:00:00Z",
        }),
      );
    }),
    unsubscribe: vi.fn(async () => {}),
    historical: vi.fn(async () => [] as readonly MarketDataPoint[]),
    health: vi.fn(async () => ({
      providerId: "feed-a",
      healthy: true,
      checkedAt: "2026-10-02T10:00:00Z",
    })),
  };
}

describe("provider market data ingestion", () => {
  it("forwards provider data to the sink", async () => {
    const provider = makeProvider();
    const accepted: MarketDataPoint[] = [];
    const ingestion = new ProviderMarketDataIngestion(provider, {
      accept: (data) => { accepted.push(data); },
    });

    await ingestion.start(
      createMarketDataSubscription({
        subscriptionId: "sub-1",
        instruments: [AAPL],
        kinds: ["quote"],
      }),
    );

    expect(provider.subscribe).toHaveBeenCalledOnce();
    expect(accepted).toHaveLength(1);
    expect(accepted[0]?.kind).toBe("quote");
  });

  it("stops the provider subscription", async () => {
    const provider = makeProvider();
    const ingestion = new ProviderMarketDataIngestion(provider, { accept() {} });

    await ingestion.stop("sub-1");

    expect(provider.unsubscribe).toHaveBeenCalledWith("sub-1");
  });

  it("propagates sink failures", async () => {
    const provider = makeProvider();
    const ingestion = new ProviderMarketDataIngestion(provider, {
      accept: () => {
        throw new Error("sink failure");
      },
    });

    await expect(
      ingestion.start(
        createMarketDataSubscription({
          subscriptionId: "sub-1",
          instruments: [AAPL],
          kinds: ["quote"],
        }),
      ),
    ).rejects.toThrow("sink failure");
  });
});
