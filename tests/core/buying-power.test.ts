import { describe, expect, it } from "vitest";
import {
  calculateAvailableBuyingPower,
  createBuyingPower,
  releaseBuyingPower,
  reserveBuyingPower,
} from "../../core/domain/src/buying-power.js";

describe("BuyingPower", () => {
  it("creates immutable capacity with no reservation by default", () => {
    const buyingPower = createBuyingPower(10_000);

    expect(buyingPower.totalCapacity).toBe(10_000);
    expect(buyingPower.reservedCapacity).toBe(0);
    expect(calculateAvailableBuyingPower(buyingPower)).toBe(10_000);
    expect(Object.isFrozen(buyingPower)).toBe(true);
  });

  it("creates capacity with a valid reservation", () => {
    const buyingPower = createBuyingPower(10_000, 2_500);

    expect(buyingPower.reservedCapacity).toBe(2_500);
    expect(calculateAvailableBuyingPower(buyingPower)).toBe(7_500);
  });

  it("rejects invalid capacity and reservation values", () => {
    expect(() => createBuyingPower(-1)).toThrow(
      "totalCapacity must be non-negative",
    );
    expect(() => createBuyingPower(Number.NaN)).toThrow(
      "totalCapacity must be finite",
    );
    expect(() => createBuyingPower(10_000, -1)).toThrow(
      "reservedCapacity must be non-negative",
    );
    expect(() => createBuyingPower(10_000, 10_001)).toThrow(
      "reservedCapacity cannot exceed totalCapacity",
    );
  });

  it("reserves available buying power without mutating the original", () => {
    const original = createBuyingPower(10_000);
    const reserved = reserveBuyingPower(original, 3_000);

    expect(original.reservedCapacity).toBe(0);
    expect(reserved.reservedCapacity).toBe(3_000);
    expect(calculateAvailableBuyingPower(reserved)).toBe(7_000);
    expect(Object.isFrozen(reserved)).toBe(true);
  });

  it("rejects reservations that exceed available buying power", () => {
    const buyingPower = createBuyingPower(10_000, 7_500);

    expect(() => reserveBuyingPower(buyingPower, 2_501)).toThrow(
      "reservation amount exceeds available buying power",
    );
  });

  it("requires positive reservation amounts", () => {
    const buyingPower = createBuyingPower(10_000);

    expect(() => reserveBuyingPower(buyingPower, 0)).toThrow(
      "amount must be positive",
    );
    expect(() => reserveBuyingPower(buyingPower, Number.POSITIVE_INFINITY)).toThrow(
      "amount must be finite",
    );
  });

  it("releases reserved capacity without mutating the original", () => {
    const original = createBuyingPower(10_000, 3_000);
    const released = releaseBuyingPower(original, 1_000);

    expect(original.reservedCapacity).toBe(3_000);
    expect(released.reservedCapacity).toBe(2_000);
    expect(calculateAvailableBuyingPower(released)).toBe(8_000);
    expect(Object.isFrozen(released)).toBe(true);
  });

  it("rejects releases greater than the current reservation", () => {
    const buyingPower = createBuyingPower(10_000, 1_000);

    expect(() => releaseBuyingPower(buyingPower, 1_001)).toThrow(
      "release amount exceeds reserved buying power",
    );
  });
});
