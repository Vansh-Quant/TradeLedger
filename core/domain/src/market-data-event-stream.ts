import type {
  Bar,
  MarketDataEnvelope,
  MarketDataPoint,
  Quote,
  TradePrint,
} from "./market-data.js";

export interface MarketDataState {
  readonly lastSequence: number;
  readonly quotes: Readonly<Record<string, Quote>>;
  readonly trades: Readonly<Record<string, TradePrint>>;
  readonly bars: Readonly<Record<string, Bar>>;
}

export interface MarketDataEventStream {
  readonly lastSequence: number;
  append<T extends MarketDataPoint>(event: MarketDataEnvelope<T>): void;
  events(): readonly MarketDataEnvelope[];
  subscribe(listener: MarketDataEventListener): () => void;
}

export type MarketDataEventListener = (
  event: MarketDataEnvelope,
) => void;

function freezeRecord<T>(
  values: Record<string, T>,
): Readonly<Record<string, T>> {
  return Object.freeze(values);
}

function barKey(bar: Bar): string {
  return JSON.stringify([bar.instrumentId, bar.timeframeSeconds]);
}

function requireNextSequence(
  currentSequence: number,
  nextSequence: number,
): void {
  if (nextSequence <= currentSequence) {
    throw new Error(
      `market-data sequence must be greater than the last sequence: ${currentSequence}`,
    );
  }
}

export function createMarketDataState(): MarketDataState {
  return Object.freeze({
    lastSequence: 0,
    quotes: freezeRecord({}),
    trades: freezeRecord({}),
    bars: freezeRecord({}),
  });
}

export function applyMarketDataEvent<T extends MarketDataPoint>(
  state: MarketDataState,
  event: MarketDataEnvelope<T>,
): MarketDataState {
  requireNextSequence(state.lastSequence, event.sequence);

  const nextQuotes = { ...state.quotes };
  const nextTrades = { ...state.trades };
  const nextBars = { ...state.bars };

  switch (event.data.kind) {
    case "quote":
      nextQuotes[event.data.instrumentId] = event.data;
      break;
    case "trade":
      nextTrades[event.data.instrumentId] = event.data;
      break;
    case "bar":
      nextBars[barKey(event.data)] = event.data;
      break;
  }

  return Object.freeze({
    lastSequence: event.sequence,
    quotes: freezeRecord(nextQuotes),
    trades: freezeRecord(nextTrades),
    bars: freezeRecord(nextBars),
  });
}

export function latestQuote(
  state: MarketDataState,
  instrumentId: Quote["instrumentId"],
): Quote | undefined {
  return state.quotes[instrumentId];
}

export function latestTrade(
  state: MarketDataState,
  instrumentId: TradePrint["instrumentId"],
): TradePrint | undefined {
  return state.trades[instrumentId];
}

export function latestBar(
  state: MarketDataState,
  instrumentId: Bar["instrumentId"],
  timeframeSeconds: number,
): Bar | undefined {
  return state.bars[JSON.stringify([instrumentId, timeframeSeconds])];
}

export class InMemoryMarketDataEventStream
  implements MarketDataEventStream
{
  private readonly history: MarketDataEnvelope[] = [];
  private readonly listeners = new Set<MarketDataEventListener>();

  public get lastSequence(): number {
    return this.history.at(-1)?.sequence ?? 0;
  }

  public append<T extends MarketDataPoint>(
    event: MarketDataEnvelope<T>,
  ): void {
    requireNextSequence(this.lastSequence, event.sequence);
    this.history.push(event);

    for (const listener of this.listeners) {
      listener(event);
    }
  }

  public events(): readonly MarketDataEnvelope[] {
    return Object.freeze(this.history.slice());
  }

  public subscribe(listener: MarketDataEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
