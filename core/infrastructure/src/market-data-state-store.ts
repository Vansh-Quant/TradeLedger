import type { InstrumentId } from "@tradeledger/domain";
import {
  applyMarketData,
  createMarketDataEnvelope,
  createMarketDataState,
  type MarketDataPoint,
  type MarketDataState,
} from "@tradeledger/domain";

export interface MarketDataStatePort {
  get(instrumentId: InstrumentId): MarketDataState | undefined;
  accept(instrumentId: InstrumentId, data: MarketDataPoint, receivedAt: string): MarketDataState;
  list(): readonly MarketDataState[];
}

export class InMemoryMarketDataStateStore implements MarketDataStatePort {
  private readonly states = new Map<InstrumentId, MarketDataState>();
  private sequence = 0;

  get(instrumentId: InstrumentId): MarketDataState | undefined {
    return this.states.get(instrumentId);
  }

  accept(
    instrumentId: InstrumentId,
    data: MarketDataPoint,
    receivedAt: string,
  ): MarketDataState {
    if (data.instrumentId !== instrumentId) {
      throw new Error("market data instrument does not match requested instrument");
    }

    const current = this.states.get(instrumentId) ?? createMarketDataState(instrumentId);
    const nextSequence = this.sequence + 1;
    const next = applyMarketData(
      current,
      createMarketDataEnvelope(nextSequence, receivedAt, data),
    );

    this.sequence = nextSequence;
    this.states.set(instrumentId, next);
    return next;
  }

  list(): readonly MarketDataState[] {
    return Object.freeze([...this.states.values()]);
  }
}


export class MarketDataStateStoreSink {
  constructor(
    private readonly store: MarketDataStatePort,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  accept(data: MarketDataPoint): MarketDataState {
    return this.store.accept(data.instrumentId, data, this.now());
  }
}
