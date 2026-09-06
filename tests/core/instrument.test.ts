import { describe, expect, it } from "vitest";
import {
  ASSET_CLASSES,
  createInstrument,
  type Instrument,
} from "../../core/domain/src/index.js";

describe("createInstrument", () => {
  it("normalizes the canonical symbol and currency codes", () => {
    const instrument = createInstrument({
      id: "  eurusd-spot ",
      symbol: " eur/usd ",
      assetClass: "forex",
      quoteCurrency: "usd",
      baseCurrency: "eur",
    });

    expect(instrument).toEqual({
      id: "eurusd-spot",
      symbol: "EUR/USD",
      assetClass: "forex",
      quoteCurrency: "USD",
      baseCurrency: "EUR",
    });
  });

  it("creates a frozen domain object", () => {
    const instrument = createInstrument({
      id: "aapl",
      symbol: "AAPL",
      assetClass: "stock",
      quoteCurrency: "USD",
    });

    expect(Object.isFrozen(instrument)).toBe(true);
  });

  it("rejects empty identity and currency values", () => {
    expect(() =>
      createInstrument({
        id: "   ",
        symbol: "AAPL",
        assetClass: "stock",
        quoteCurrency: "USD",
      }),
    ).toThrow("id must not be empty");

    expect(() =>
      createInstrument({
        id: "aapl",
        symbol: "   ",
        assetClass: "stock",
        quoteCurrency: "USD",
      }),
    ).toThrow("symbol must not be empty");

    expect(() =>
      createInstrument({
        id: "aapl",
        symbol: "AAPL",
        assetClass: "stock",
        quoteCurrency: "   ",
      }),
    ).toThrow("quoteCurrency must not be empty");
  });

  it("supports the optional base currency", () => {
    const instrument: Instrument = createInstrument({
      id: "btc-usd",
      symbol: "BTC/USD",
      assetClass: "crypto",
      quoteCurrency: "USD",
      baseCurrency: "BTC",
    });

    expect(instrument.baseCurrency).toBe("BTC");
  });

  it("exposes a closed set of initial asset classes", () => {
    expect(ASSET_CLASSES).toContain("stock");
    expect(ASSET_CLASSES).toContain("forex");
    expect(ASSET_CLASSES).toContain("future");
    expect(ASSET_CLASSES).toContain("option");
    expect(ASSET_CLASSES).toContain("crypto");
  });
});
