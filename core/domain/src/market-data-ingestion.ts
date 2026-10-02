import type { MarketDataPoint } from "../../domain/src/market-data.js";
import type { MarketDataProvider, MarketDataSubscription } from "../../domain/src/market-data-provider.js";

export interface MarketDataIngestion {
  readonly provider: MarketDataProvider;
  start(subscription: MarketDataSubscription): Promise<void>;
  stop(subscriptionId: string): Promise<void>;
}

export interface MarketDataSink {
  accept(data: MarketDataPoint): Promise<void> | void;
}

export class ProviderMarketDataIngestion implements MarketDataIngestion {
  public constructor(
    public readonly provider: MarketDataProvider,
    private readonly sink: MarketDataSink,
  ) {}

  async start(subscription: MarketDataSubscription): Promise<void> {
    await this.provider.subscribe(subscription, async (data) => {
      await this.sink.accept(data);
    });
  }

  async stop(subscriptionId: string): Promise<void> {
    await this.provider.unsubscribe(subscriptionId);
  }
}
