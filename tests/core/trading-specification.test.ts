import { describe, expect, it } from "vitest";
import {
  createTradingSpecification,
  isValidPrice,
  isValidQuantity,
} from "../../core/domain/src/trading-specification.js";

const specification = createTradingSpecification({
  price: {
    tickSize: 0.01,
    pricePrecision: 2,
  },
  quantity: {
    minQuantity: 0.001,
    maxQuantity: 1000,
    quantityStep: 0.001,
    quantityPrecision: 3,
  },
  contract: {
    contractSize: 1,
  },
});

describe("createTradingSpecification", () => {
  it("creates a validated specification", () => {
    expect(specification.price.tickSize).toBe(0.01);
    expect(specification.quantity.minQuantity).toBe(0.001);
    expect(specification.contract.contractSize).toBe(1);
  });

  it("rejects invalid numeric rules", () => {
    expect(() =>
      createTradingSpecification({
        ...specification,
        price: { tickSize: 0, pricePrecision: 2 },
      }),
    ).toThrow("tickSize must be a finite positive number");

    expect(() =>
      createTradingSpecification({
        ...specification,
        quantity: {
          ...specification.quantity,
          maxQuantity: 0.0005,
        },
      }),
    ).toThrow("maxQuantity must be greater than or equal to minQuantity");
  });

  it("rejects invalid precision values", () => {
    expect(() =>
      createTradingSpecification({
        ...specification,
        price: { tickSize: 0.01, pricePrecision: 1.5 },
      }),
    ).toThrow("pricePrecision must be a non-negative integer");
  });

  it("returns an immutable specification", () => {
    expect(Object.isFrozen(specification)).toBe(true);
    expect(Object.isFrozen(specification.price)).toBe(true);
    expect(Object.isFrozen(specification.quantity)).toBe(true);
    expect(Object.isFrozen(specification.contract)).toBe(true);
  });
});

describe("isValidPrice", () => {
  it("accepts prices on the configured tick", () => {
    expect(isValidPrice(67432.12, specification.price)).toBe(true);
    expect(isValidPrice(67432.13, specification.price)).toBe(true);
  });

  it("rejects prices that violate the tick or precision", () => {
    expect(isValidPrice(67432.125, specification.price)).toBe(false);
    expect(isValidPrice(67432.121, specification.price)).toBe(false);
    expect(isValidPrice(0, specification.price)).toBe(false);
  });
});

describe("isValidQuantity", () => {
  it("accepts quantities within the configured range and step", () => {
    expect(isValidQuantity(0.001, specification.quantity)).toBe(true);
    expect(isValidQuantity(0.005, specification.quantity)).toBe(true);
    expect(isValidQuantity(1000, specification.quantity)).toBe(true);
  });

  it("rejects quantities outside the configured range", () => {
    expect(isValidQuantity(0.0005, specification.quantity)).toBe(false);
    expect(isValidQuantity(1000.001, specification.quantity)).toBe(false);
  });

  it("rejects quantities that violate the step or precision", () => {
    expect(isValidQuantity(0.0015, specification.quantity)).toBe(false);
    expect(isValidQuantity(0.0001, specification.quantity)).toBe(false);
  });
});
