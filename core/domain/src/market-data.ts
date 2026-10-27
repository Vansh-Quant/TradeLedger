import type { InstrumentId } from "./instrument.js";

export const MARKET_DATA_SIDES = ["buy", "sell"] as const;
export type MarketDataSide = (typeof MARKET_DATA_SIDES)[number];

export const MARKET_DATA_KINDS = ["quote", "trade", "bar"] as const;
export type MarketDataKind = (typeof MARKET_DATA_KINDS)[number];

export interface QuoteInput {
  readonly instrumentId: InstrumentId;
  readonly bid: number;
  /** Optional: not every venue publishes depth. Absent means "unknown", never zero. */
  readonly bidSize?: number;
  readonly ask: number;
  /** Optional: not every venue publishes depth. Absent means "unknown", never zero. */
  readonly askSize?: number;
  readonly observedAt: string;
  readonly source?: string;
}

export interface Quote {
  readonly kind: "quote";
  readonly instrumentId: InstrumentId;
  readonly bid: number;
  /** Absent when the venue does not publish depth. */
  readonly bidSize?: number;
  readonly ask: number;
  /** Absent when the venue does not publish depth. */
  readonly askSize?: number;
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
    // Depth is only asserted when the venue actually provided it.
    ...(input.bidSize === undefined ? {} : { bidSize: requireFinitePositive(input.bidSize, "bidSize") }),
    ask,
    ...(input.askSize === undefined ? {} : { askSize: requireFinitePositive(input.askSize, "askSize") }),
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

/**
 * Calendar aggregation of closed daily bars into longer periods.
 *
 * Aggregation only ever moves to a *longer* period, and only along calendar
 * boundaries (UTC weeks start Monday, UTC months start on the 1st), so no
 * lower-timeframe candles are ever derived from higher-timeframe data and no
 * candle straddles two calendar periods.
 */
export const BAR_AGGREGATION_TARGETS = ["1w", "1M"] as const;
export type BarAggregationTarget = (typeof BAR_AGGREGATION_TARGETS)[number];

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

export function isBarAggregationTarget(value: string): value is BarAggregationTarget {
  return (BAR_AGGREGATION_TARGETS as readonly string[]).includes(value);
}

function utcWeekStart(ms: number): number {
  const date = new Date(ms);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - daysSinceMonday);
}

function utcMonthStart(ms: number): number {
  const date = new Date(ms);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

function utcNextMonthStart(ms: number): number {
  const date = new Date(ms);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}

function parseTimestamp(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(field + " must be a valid timestamp");
  return parsed;
}

function assertTarget(target: string): asserts target is BarAggregationTarget {
  if (!isBarAggregationTarget(target)) {
    throw new Error(`aggregation target "${target}" is invalid; valid targets are ${BAR_AGGREGATION_TARGETS.join(", ")}`);
  }
}

/**
 * Aligns a requested window down to whole calendar periods of `target` so an
 * aggregation never presents a partial period as a complete candle.
 * `fetchFrom` is the aligned instant the upstream history must be read from.
 */
export function alignAggregationRange(
  target: string,
  startAt: string,
  endAt: string,
): { readonly fetchFrom: string; readonly alignedFrom: string } {
  assertTarget(target);
  const startMs = parseTimestamp(startAt, "startAt");
  const endMs = parseTimestamp(endAt, "endAt");
  if (endMs <= startMs) throw new Error("endAt must be after startAt");
  const aligned = target === "1w" ? utcWeekStart(startMs) : utcMonthStart(startMs);
  return Object.freeze({ fetchFrom: new Date(aligned).toISOString(), alignedFrom: new Date(aligned).toISOString() });
}

interface AggregationGroup {
  boundary: number;
  endMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source?: string;
}

/**
 * Aggregates strictly chronological closed daily bars into calendar-aligned
 * weekly (`1w`) or monthly (`1M`) bars. The first group never claims a period
 * that starts before the first available source bar.
 */
export function aggregateDailyBars(
  bars: readonly Bar[],
  target: string,
): readonly Bar[] {
  assertTarget(target);
  if (bars.length === 0) return Object.freeze([]);

  const instrumentId = bars[0]!.instrumentId;
  const firstSourceMs = parseTimestamp(bars[0]!.startAt, "startAt");
  const groups: AggregationGroup[] = [];
  let previousStartMs = Number.NEGATIVE_INFINITY;

  for (const bar of bars) {
    if (bar.instrumentId !== instrumentId) {
      throw new Error("cannot aggregate bars from different instruments");
    }
    if (bar.timeframeSeconds !== 86_400) {
      throw new Error("only daily bars can be aggregated into weekly or monthly bars");
    }
    const startMs = parseTimestamp(bar.startAt, "startAt");
    if (startMs <= previousStartMs) {
      throw new Error("bars must be strictly chronological and free of duplicates before aggregation");
    }
    previousStartMs = startMs;

    const boundary = target === "1w" ? utcWeekStart(startMs) : utcMonthStart(startMs);
    const endMs = target === "1w" ? boundary + WEEK_MS : utcNextMonthStart(boundary);
    const current = groups[groups.length - 1];
    if (current === undefined || current.boundary !== boundary) {
      groups.push({
        boundary,
        endMs,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
        ...(bar.source === undefined ? {} : { source: bar.source }),
      });
    } else {
      current.high = Math.max(current.high, bar.high);
      current.low = Math.min(current.low, bar.low);
      current.close = bar.close;
      current.volume += bar.volume;
    }
  }

  const aggregated = groups.map((group) => {
    const startMs = Math.max(group.boundary, firstSourceMs);
    const timeframeSeconds = Math.round((group.endMs - startMs) / 1000);
    return createBar({
      instrumentId,
      timeframeSeconds,
      startAt: new Date(startMs).toISOString(),
      endAt: new Date(group.endMs).toISOString(),
      open: group.open,
      high: group.high,
      low: group.low,
      close: group.close,
      volume: group.volume,
      ...(group.source === undefined ? {} : { source: group.source }),
    });
  });

  return Object.freeze(aggregated);
}
