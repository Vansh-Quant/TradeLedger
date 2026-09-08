import { describe, expect, it } from "vitest";
import { applyFill, createPosition } from "../../core/domain/src/position.js";

describe("Position", () => {
  it("starts flat", () => {
    const position = createPosition("AAPL");

    expect(position.quantity).toBe(0);
    expect(position.averagePrice).toBeUndefined();
    expect(position.realizedPnl).toBe(0);
    expect(position.side).toBe("flat");
  });

  it("opens and increases a long position with weighted average", () => {
    let position = createPosition("AAPL");
    position = applyFill(position, "buy", { quantity: 10, price: 100 });
    position = applyFill(position, "buy", { quantity: 5, price: 110 });

    expect(position.quantity).toBe(15);
    expect(position.averagePrice).toBeCloseTo(103.3333333333);
    expect(position.side).toBe("long");
    expect(position.realizedPnl).toBe(0);
  });

  it("partially closes a long and realizes pnl", () => {
    let position = createPosition("AAPL");
    position = applyFill(position, "buy", { quantity: 10, price: 100 });
    position = applyFill(position, "sell", { quantity: 4, price: 120 });

    expect(position.quantity).toBe(6);
    expect(position.averagePrice).toBe(100);
    expect(position.realizedPnl).toBe(80);
    expect(position.side).toBe("long");
  });

  it("fully closes a long", () => {
    let position = createPosition("AAPL");
    position = applyFill(position, "buy", { quantity: 10, price: 100 });
    position = applyFill(position, "sell", { quantity: 10, price: 120 });

    expect(position.quantity).toBe(0);
    expect(position.averagePrice).toBeUndefined();
    expect(position.realizedPnl).toBe(200);
    expect(position.side).toBe("flat");
  });

  it("opens and increases a short position", () => {
    let position = createPosition("AAPL");
    position = applyFill(position, "sell", { quantity: 10, price: 120 });
    position = applyFill(position, "sell", { quantity: 5, price: 100 });

    expect(position.quantity).toBe(-15);
    expect(position.averagePrice).toBeCloseTo(113.3333333333);
    expect(position.side).toBe("short");
  });

  it("partially closes a short and realizes pnl", () => {
    let position = createPosition("AAPL");
    position = applyFill(position, "sell", { quantity: 10, price: 120 });
    position = applyFill(position, "buy", { quantity: 4, price: 100 });

    expect(position.quantity).toBe(-6);
    expect(position.averagePrice).toBe(120);
    expect(position.realizedPnl).toBe(80);
    expect(position.side).toBe("short");
  });

  it("reverses a long into a short", () => {
    let position = createPosition("AAPL");
    position = applyFill(position, "buy", { quantity: 10, price: 100 });
    position = applyFill(position, "sell", { quantity: 15, price: 120 });

    expect(position.quantity).toBe(-5);
    expect(position.averagePrice).toBe(120);
    expect(position.realizedPnl).toBe(200);
    expect(position.side).toBe("short");
  });

  it("reverses a short into a long", () => {
    let position = createPosition("AAPL");
    position = applyFill(position, "sell", { quantity: 10, price: 120 });
    position = applyFill(position, "buy", { quantity: 15, price: 100 });

    expect(position.quantity).toBe(5);
    expect(position.averagePrice).toBe(100);
    expect(position.realizedPnl).toBe(200);
    expect(position.side).toBe("long");
  });

  it("rejects invalid fills", () => {
    const position = createPosition("AAPL");

    expect(() => applyFill(position, "buy", { quantity: 0, price: 100 })).toThrow();
    expect(() => applyFill(position, "buy", { quantity: 1, price: 0 })).toThrow();
    expect(() => applyFill(position, "buy", { quantity: Number.NaN, price: 100 })).toThrow();
  });
});
