/**
 * Canonical asset classes understood by the TradeLedger domain.
 *
 * This list is intentionally about the economic instrument class, not a
 * broker-specific product name. Venue and contract details can be added later
 * without changing the meaning of the core identity model.
 */
export const ASSET_CLASSES = [
  "stock",
  "etf",
  "forex",
  "future",
  "option",
  "crypto",
  "commodity",
  "index",
  "bond",
  "cfd",
  "custom",
] as const;

export type AssetClass = (typeof ASSET_CLASSES)[number];

export type InstrumentId = string & { readonly __brand: "InstrumentId" };

export interface Instrument {
  readonly id: InstrumentId;
  readonly symbol: string;
  readonly assetClass: AssetClass;
  readonly quoteCurrency: string;
  readonly baseCurrency?: string;
}

export interface InstrumentInput {
  readonly id: string;
  readonly symbol: string;
  readonly assetClass: AssetClass;
  readonly quoteCurrency: string;
  readonly baseCurrency?: string;
}

function normalizeCode(value: string, field: string): string {
  const normalized = value.trim().toUpperCase();

  if (normalized.length === 0) {
    throw new Error(`${field} must not be empty`);
  }

  return normalized;
}

function normalizeId(value: string): InstrumentId {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new Error("id must not be empty");
  }

  return normalized as InstrumentId;
}

/**
 * Creates the canonical domain representation of an instrument.
 *
 * Domain objects are validated at the boundary so downstream engines can
 * operate on trusted values rather than repeatedly checking basic invariants.
 */
export function createInstrument(input: InstrumentInput): Instrument {
  const instrument: Instrument = {
    id: normalizeId(input.id),
    symbol: normalizeCode(input.symbol, "symbol"),
    assetClass: input.assetClass,
    quoteCurrency: normalizeCode(input.quoteCurrency, "quoteCurrency"),
    ...(input.baseCurrency === undefined
      ? {}
      : { baseCurrency: normalizeCode(input.baseCurrency, "baseCurrency") }),
  };

  return Object.freeze(instrument);
}
