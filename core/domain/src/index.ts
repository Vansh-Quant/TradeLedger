/**
 * TradeLedger core domain.
 *
 * Domain objects are intentionally framework-agnostic. Infrastructure,
 * persistence, and UI concerns must not leak into this layer.
 */

export type Brand<T, B extends string> = T & { readonly __brand: B };

export type InstrumentId = Brand<string, "InstrumentId">;

export interface Instrument {
  readonly id: InstrumentId;
  readonly symbol: string;
  readonly assetClass: string;
  readonly quoteCurrency: string;
  readonly baseCurrency?: string;
}
