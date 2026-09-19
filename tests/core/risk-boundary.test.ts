import { describe, expect, it } from "vitest";
import {
  checkDailyLoss,
  checkGrossExposure,
  checkNetExposure,
  checkOrderNotional,
  checkPositionNotional,
  createRiskLimits,
} from "../../core/domain/src/risk-boundary.js";

describe("RiskLimits", () => {
  const limits = createRiskLimits({
    maxOrderNotional: 10_000,
    maxPositionNotional: 25_000,
    maxGrossExposure: 50_000,
    maxNetExposure: 20_000,
    maxDailyLoss: 2_000,
  });

  it("creates immutable validated limits", () => {
    expect(limits.maxOrderNotional).toBe(10_000);
    expect(Object.isFrozen(limits)).toBe(true);
  });

  it("rejects invalid limit configuration", () => {
    expect(() => createRiskLimits({ ...limits, maxOrderNotional: 0 })).toThrow(
      "maxOrderNotional must be a positive finite number",
    );
    expect(() => createRiskLimits({ ...limits, maxDailyLoss: Number.NaN })).toThrow(
      "maxDailyLoss must be a positive finite number",
    );
  });

  it("allows order notional at or below the configured boundary", () => {
    expect(checkOrderNotional(10_000, limits)).toEqual({ allowed: true });
    expect(checkOrderNotional(9_999, limits)).toEqual({ allowed: true });
  });

  it("rejects order notional above the configured boundary", () => {
    expect(checkOrderNotional(10_001, limits)).toEqual({
      allowed: false,
      reason: "order notional exceeds configured limit",
    });
  });

  it("checks position and exposure boundaries", () => {
    expect(checkPositionNotional(25_000, limits).allowed).toBe(true);
    expect(checkPositionNotional(25_001, limits).allowed).toBe(false);
    expect(checkGrossExposure(50_001, limits).allowed).toBe(false);
    expect(checkNetExposure(-20_000, limits).allowed).toBe(true);
    expect(checkNetExposure(-20_001, limits).allowed).toBe(false);
  });

  it("checks daily loss against the configured boundary", () => {
    expect(checkDailyLoss(2_000, limits).allowed).toBe(true);
    expect(checkDailyLoss(2_001, limits)).toEqual({
      allowed: false,
      reason: "daily loss exceeds configured limit",
    });
  });

  it("rejects invalid measured risk values", () => {
    expect(() => checkGrossExposure(-1, limits)).toThrow(
      "gross exposure must be a non-negative finite number",
    );
    expect(() => checkOrderNotional(Number.POSITIVE_INFINITY, limits)).toThrow(
      "order notional must be a non-negative finite number",
    );
  });
});
