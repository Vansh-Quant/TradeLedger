import { describe, expect, it } from "vitest";
import type { InstrumentId } from "../../core/domain/src/instrument.js";
import { createExecution } from "../../core/domain/src/execution.js";

const instrumentId = "BTC-USD" as InstrumentId;

const baseExecution = {
  id: "execution-001",
  orderId: "order-001",
  instrumentId,
  side: "buy" as const,
  quantity: 0.5,
  price: 67000,
  executedAt: "2026-09-14T12:00:00.000Z",
  commission: 12.5,
};

describe("createExecution", () => {
  it("creates a valid immutable execution", () => {
    const execution = createExecution(baseExecution);

    expect(execution).toEqual(baseExecution);
    expect(Object.isFrozen(execution)).toBe(true);
  });

  it("preserves the order relationship and execution details", () => {
    const execution = createExecution({
      ...baseExecution,
      orderId: "order-123",
      side: "sell",
      quantity: 2,
      price: 67125.5,
      commission: 0,
    });

    expect(execution.orderId).toBe("order-123");
    expect(execution.side).toBe("sell");
    expect(execution.quantity).toBe(2);
    expect(execution.price).toBe(67125.5);
    expect(execution.commission).toBe(0);
  });

  it("rejects empty required identifiers", () => {
    expect(() => createExecution({ ...baseExecution, id: " " })).toThrow(
      "id must not be empty",
    );
    expect(() => createExecution({ ...baseExecution, orderId: " " })).toThrow(
      "orderId must not be empty",
    );
    expect(() => createExecution({ ...baseExecution, instrumentId: " " as InstrumentId })).toThrow(
      "instrumentId must not be empty",
    );
  });

  it("rejects invalid side values", () => {
    expect(() => createExecution({
      ...baseExecution,
      side: "hold" as never,
    })).toThrow("side must be one of: buy, sell");
  });

  it("rejects non-positive or non-finite quantities and prices", () => {
    expect(() => createExecution({ ...baseExecution, quantity: 0 })).toThrow(
      "quantity must be a finite positive number",
    );
    expect(() => createExecution({ ...baseExecution, quantity: Number.NaN })).toThrow(
      "quantity must be a finite positive number",
    );
    expect(() => createExecution({ ...baseExecution, price: 0 })).toThrow(
      "price must be a finite positive number",
    );
    expect(() => createExecution({ ...baseExecution, price: Number.POSITIVE_INFINITY })).toThrow(
      "price must be a finite positive number",
    );
  });

  it("rejects invalid commission values", () => {
    expect(() => createExecution({ ...baseExecution, commission: -0.01 })).toThrow(
      "commission must be a finite non-negative number",
    );
    expect(() => createExecution({ ...baseExecution, commission: Number.NaN })).toThrow(
      "commission must be a finite non-negative number",
    );
    expect(() => createExecution({ ...baseExecution, commission: Number.POSITIVE_INFINITY })).toThrow(
      "commission must be a finite non-negative number",
    );
  });

  it("rejects invalid execution timestamps", () => {
    expect(() => createExecution({ ...baseExecution, executedAt: "not-a-date" })).toThrow(
      "executedAt must be a valid timestamp",
    );
  });

  it("accepts partial-fill executions as independent records", () => {
    const first = createExecution({
      ...baseExecution,
      id: "execution-001",
      quantity: 0.3,
      price: 66990,
    });
    const second = createExecution({
      ...baseExecution,
      id: "execution-002",
      quantity: 0.2,
      price: 67000,
    });

    expect(first.orderId).toBe(second.orderId);
    expect(first.id).not.toBe(second.id);
    expect(first.quantity + second.quantity).toBe(0.5);
  });
});
