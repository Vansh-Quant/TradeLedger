import { describe, expect, it } from "vitest";
import {
  appendIntelligenceEvent,
  buildMarketContext,
  createEconomicCalendarEvent,
  createIntelligenceArchive,
  createIntelligenceEvent,
  queryIntelligence,
} from "../../core/domain/src/index.js";

const base = {
  id: "E1",
  title: "CPI",
  summary: "Inflation release",
  source: "official",
  publishedAt: "2026-10-07T09:00:00Z",
  instruments: ["AAPL"],
  regions: ["US"],
  impact: "high" as const,
  tags: ["macro"],
};

describe("intelligence", () => {
  it("archives, queries and builds market context", () => {
    let archive = createIntelligenceArchive();
    archive = appendIntelligenceEvent(
      archive,
      createIntelligenceEvent({ type: "economic", ...base }),
    );
    archive = appendIntelligenceEvent(
      archive,
      createIntelligenceEvent({
        type: "news",
        ...base,
        id: "E2",
        publishedAt: "2026-10-07T10:00:00Z",
      }),
    );

    expect(queryIntelligence(archive, {
      instrumentId: "AAPL",
      impactAtLeast: "high",
    })).toHaveLength(2);

    const context = buildMarketContext(
      "AAPL",
      "2026-10-07T11:00:00Z",
      archive.events,
    );

    expect(context.highImpactCount).toBe(2);
    expect(context.eventIds).toHaveLength(2);
  });

  it("creates economic calendar events", () => {
    const event = createEconomicCalendarEvent({
      ...base,
      id: "CPI-1",
      effectiveAt: "2026-10-07T12:00:00Z",
      country: "US",
      indicator: "CPI",
      forecast: 3.1,
      previous: 3.0,
    });

    expect(event.type).toBe("economic");
    expect(event.indicator).toBe("CPI");
    expect(event.forecast).toBe(3.1);
  });
});
