import { describe, expect, it } from "vitest";
import {
  activateWorkspacePanel,
  attachWorkspaceChart,
  createChartViewport,
  createTradingWorkspace,
  selectWorkspaceInstrument,
  type AccountId,
  type InstrumentId,
} from "../../core/domain/src/index.js";

describe("trading workspace", () => {
  it("keeps selected instrument and chart consistent", () => {
    let workspace = createTradingWorkspace("ACC-1" as AccountId);
    workspace = selectWorkspaceInstrument(
      workspace,
      "AAPL" as InstrumentId,
    );

    const chart = createChartViewport({
      instrumentId: "AAPL" as InstrumentId,
      interval: "1m",
      from: "2026-10-07T10:00:00Z",
      to: "2026-10-07T11:00:00Z",
    });

    workspace = attachWorkspaceChart(workspace, chart);
    workspace = activateWorkspacePanel(workspace, "order_ticket");

    expect(workspace.selectedInstrumentId).toBe("AAPL");
    expect(workspace.activePanel).toBe("order_ticket");
  });
});
