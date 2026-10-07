import { describe, expect, it } from "vitest";
import { createChartViewport, withChartIndicator, withoutChartIndicator, type InstrumentId } from "../../core/domain/src/index.js";

describe("charting", () => {
  it("creates and evolves a chart viewport", () => {
    let chart = createChartViewport({
      instrumentId: "AAPL" as InstrumentId,
      interval: "5m",
      from: "2026-10-07T10:00:00Z",
      to: "2026-10-07T11:00:00Z",
    });
    chart = withChartIndicator(chart, "RSI");
    expect(chart.indicators).toEqual(["RSI"]);
    chart = withoutChartIndicator(chart, "RSI");
    expect(chart.indicators).toEqual([]);
  });
});
