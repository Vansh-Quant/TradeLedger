import type { InstrumentId } from "./instrument.js";

export const MARKET_DATA_SIDES = ["buy", "sell"] as const;
export type MarketDataSide = (typeof MARKET_DATA_SIDES)[number];

export const MARKET_DATA_KINDS = ["quote", "trade", "bar"] as const;
export type MarketDataKind = (typeof MARKET_DATA_KINDS)[number];

export interface QuoteInput {
  readonly instrumentId: InstrumentId;
  readonly bid: number;
  readonly bidSize: number;
  readonly ask: number;
  readonly askSize: number;
  readonly observedAt: string;
  readonly source?: string;
}

export interface Quote {
  readonly kind: "quote";
  readonly instrumentId: InstrumentId;
  readonly bid: number;
  readonly bidSize: number;
  readonly ask: number;
  readonly askSize: number;
  readonly observedAt: string;
  readonly source?: string;
}

export interface TradeInput {
  readonly instrumentId: InstrumentId;
  readonly price: number;
  readonly quantity: number;
  readonly observedAt: string;
  readonly side?: MarketDataSide;
  readonly source?: string;
}

export interface TradePrint {
  readonly kind: "trade";
  readonly instrumentId: InstrumentId;
  readonly price: number;
  readonly quantity: number;
  readonly observedAt: string;
  readonly side?: MarketDataSide;
  readonly source?: string;
}

export interface BarInput {
  readonly instrumentId: InstrumentId;
  readonly timeframeSeconds: number;
  readonly startAt: string;
  readonly endAt: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly source?: string;
}

export interface Bar {
  readonly kind: "bar";
  readonly instrumentId: InstrumentId;
  readonly timeframeSeconds: number;
  readonly startAt: string;
  readonly endAt: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly source?: string;
}

export type MarketDataPoint = Quote | TradePrint | Bar;

export interface MarketDataEnvelope<T extends MarketDataPoint = MarketDataPoint> {
  readonly sequence: number;
  readonly receivedAt: string;
  readonly data: T;
}

function requireFinitePositive(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(field + " must be a finite positive number");
  }
  return value;
}

function requireNonNegative(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(field + " must be a finite non-negative number");
  }
  return value;
}

function requirePositiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(field + " must be a positive integer");
  }
  return value;
}

function requireSequence(value: number): number {
  return requirePositiveInteger(value, "sequence");
}

function requireTimestamp(value: string, field: string): string {
  if (Number.isNaN(Date.parse(value))) {
    throw new Error(field + " must be a valid timestamp");
  }
  return value;
}

function normalizeSource(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error("source must not be empty");
  }
  return normalized;
}

export function createQuote(input: QuoteInput): Quote {
  const bid = requireFinitePositive(input.bid, "bid");
  const ask = requireFinitePositive(input.ask, "ask");

  if (bid > ask) {
    throw new Error("bid must be less than or equal to ask");
  }

  const source = normalizeSource(input.source);
  const quote: Quote = {
    kind: "quote",
    instrumentId: input.instrumentId,
    bid,
    bidSize: requireFinitePositive(input.bidSize, "bidSize"),
    ask,
    askSize: requireFinitePositive(input.askSize, "askSize"),
    observedAt: requireTimestamp(input.observedAt, "observedAt"),
    ...(source === undefined ? {} : { source }),
  };

  return Object.freeze(quote);
}

export function createTradePrint(input: TradeInput): TradePrint {
  const source = normalizeSource(input.source);
  const trade: TradePrint = {
    kind: "trade",
    instrumentId: input.instrumentId,
    price: requireFinitePositive(input.price, "price"),
    quantity: requireFinitePositive(input.quantity, "quantity"),
    observedAt: requireTimestamp(input.observedAt, "observedAt"),
    ...(input.side === undefined ? {} : { side: input.side }),
    ...(source === undefined ? {} : { source }),
  };

  return Object.freeze(trade);
}

export function createBar(input: BarInput): Bar {
  const start = requireTimestamp(input.startAt, "startAt");
  const end = requireTimestamp(input.endAt, "endAt");

  if (Date.parse(end) <= Date.parse(start)) {
    throw new Error("endAt must be after startAt");
  }

  const open = requireFinitePositive(input.open, "open");
  const high = requireFinitePositive(input.high, "high");
  const low = requireFinitePositive(input.low, "low");
  const close = requireFinitePositive(input.close, "close");

  if (high < Math.max(open, close)) {
    throw new Error("high must be greater than or equal to open and close");
  }

  if (low > Math.min(open, close)) {
    throw new Error("low must be less than or equal to open and close");
  }

  const source = normalizeSource(input.source);
  const bar: Bar = {
    kind: "bar",
    instrumentId: input.instrumentId,
    timeframeSeconds: requirePositiveInteger(
      input.timeframeSeconds,
      "timeframeSeconds",
    ),
    startAt: start,
    endAt: end,
    open,
    high,
    low,
    close,
    volume: requireNonNegative(input.volume, "volume"),
    ...(source === undefined ? {} : { source }),
  };

  return Object.freeze(bar);
}

export function createMarketDataEnvelope<T extends MarketDataPoint>(
  sequence: number,
  receivedAt: string,
  data: T,
): MarketDataEnvelope<T> {
  return Object.freeze({
    sequence: requireSequence(sequence),
    receivedAt: requireTimestamp(receivedAt, "receivedAt"),
    data,
  });
}

export function midPrice(quote: Quote): number {
  return (quote.bid + quote.ask) / 2;
}

export function spread(quote: Quote): number {
  return quote.ask - quote.bid;
}

export function isMarketDataPoint(value: MarketDataPoint): boolean {
  return value.kind === "quote" || value.kind === "trade" || value.kind === "bar";
}
