import { describe, expect, it } from "vitest";
import {
  applyReservationRelease,
  createAccount,
  createAccountPortfolio,
  createBuyingPower,
  createOrder,
  createOrderBuyingPowerReservation,
  releaseRemainingOrderReservation,
  releaseReservationForFill,
  reserveBuyingPower,
  type InstrumentId,
} from "../../core/domain/src/index.js";

const account = createAccount({ id: "ACC-001", baseCurrency: "USD" });

function makeOrder(quantity = 10) {
  return createOrder({
    id: "ORD-001",
    accountId: account.id,
    instrumentId: "AAPL" as InstrumentId,
    side: "buy",
    type: "limit",
    quantity,
    limitPrice: 100,
    timeInForce: "day",
    createdAt: "2026-10-01T10:00:00Z",
  });
}

describe("order buying-power reservation lifecycle", () => {
  it("creates an order-level reservation from approved notional", () => {
    const reservation = createOrderBuyingPowerReservation(makeOrder(), 1_000);

    expect(reservation.orderId).toBe("ORD-001");
    expect(reservation.initialAmount).toBe(1_000);
    expect(reservation.remainingAmount).toBe(1_000);
    expect(reservation.quantity).toBe(10);
  });

  it("releases reservation proportionally as fills are applied", () => {
    const reservation = createOrderBuyingPowerReservation(makeOrder(), 1_000);

    const afterFour = releaseReservationForFill(reservation, 4);
    const afterAll = releaseReservationForFill(afterFour, 6);

    expect(afterFour.remainingAmount).toBe(600);
    expect(afterAll.remainingAmount).toBe(0);
  });

  it("never releases more than the remaining reservation", () => {
    const reservation = createOrderBuyingPowerReservation(makeOrder(3), 100);

    const afterTwo = releaseReservationForFill(reservation, 2);
    const afterFinal = releaseReservationForFill(afterTwo, 1);

    expect(afterTwo.remainingAmount).toBeCloseTo(33.3333333333);
    expect(afterFinal.remainingAmount).toBe(0);
  });

  it("releases all remaining reservation on cancellation completion", () => {
    const reservation = createOrderBuyingPowerReservation(makeOrder(), 1_000);
    const partiallyReleased = releaseReservationForFill(reservation, 4);
    const cancelled = releaseRemainingOrderReservation(partiallyReleased);

    expect(cancelled.remainingAmount).toBe(0);
  });

  it("updates buying power only by the released amount", () => {
    const reservation = createOrderBuyingPowerReservation(makeOrder(), 1_000);
    const buyingPower = reserveBuyingPower(createBuyingPower(5_000), 1_000);
    const nextReservation = releaseReservationForFill(reservation, 4);
    const nextBuyingPower = applyReservationRelease(
      buyingPower,
      reservation,
      nextReservation,
    );

    expect(nextBuyingPower.reservedCapacity).toBe(600);
    expect(nextBuyingPower.totalCapacity).toBe(5_000);
  });

  it("rejects a fill larger than the order quantity", () => {
    const reservation = createOrderBuyingPowerReservation(makeOrder(), 1_000);

    expect(() => releaseReservationForFill(reservation, 11)).toThrow(
      "fillQuantity cannot exceed reserved order quantity",
    );
  });

  it("rejects a release that exceeds current buying-power reservation", () => {
    const reservation = createOrderBuyingPowerReservation(makeOrder(), 1_000);
    const released = releaseRemainingOrderReservation(reservation);

    expect(() =>
      applyReservationRelease(
        createBuyingPower(5_000, 500),
        reservation,
        released,
      ),
    ).toThrow("reservation release exceeds reserved buying power");
  });
});
