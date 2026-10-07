import { describe, expect, it } from "vitest";
import { createIntelligenceEvent, rankIntelligence } from "../../core/domain/src/index.js";

describe("intelligence feed", () => {
  it("ranks instrument-specific high impact events first", () => {
    const generic = createIntelligenceEvent({
      id: "GEN",
      type: "news",
      title: "Market",
      summary: "Market context",
      source: "feed",
      publishedAt: "2026-10-07T10:00:00Z",
      impact: "high",
    });
    const specific = createIntelligenceEvent({
      id: "SPEC",
      type: "earnings",
      title: "AAPL Earnings",
      summary: "Results",
      source: "filing",
      publishedAt: "2026-10-07T09:00:00Z",
      instruments: ["AAPL"],
      impact: "high",
    });

    const result = rankIntelligence([generic, specific], {
      instrumentId: "AAPL",
      impactAtLeast: "high",
    });

    expect(result[0]?.event.id).toBe("SPEC");
  });
});
