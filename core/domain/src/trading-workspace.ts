import type { AccountId } from "./account.js";
import type { InstrumentId } from "./instrument.js";
import type { ChartViewport } from "./charting.js";

export const WORKSPACE_PANELS = ["chart","order_ticket","orders","positions","risk","journal","market_data"] as const;
export type WorkspacePanel = (typeof WORKSPACE_PANELS)[number];

export interface TradingWorkspace {
  readonly accountId: AccountId;
  readonly selectedInstrumentId?: InstrumentId;
  readonly activePanel: WorkspacePanel;
  readonly chart?: ChartViewport;
  readonly watchlistId?: string;
}

function nonEmpty(value: string, field: string): string {
  const v = value.trim();
  if (!v) throw new Error(field + " must not be empty");
  return v;
}

export function createTradingWorkspace(accountId: AccountId): TradingWorkspace {
  return Object.freeze({ accountId, activePanel: "chart" });
}

export function selectWorkspaceInstrument(workspace: TradingWorkspace, instrumentId: InstrumentId): TradingWorkspace {
  return Object.freeze({ ...workspace, selectedInstrumentId: nonEmpty(instrumentId, "instrumentId") as InstrumentId });
}

export function activateWorkspacePanel(workspace: TradingWorkspace, panel: WorkspacePanel): TradingWorkspace {
  if (!WORKSPACE_PANELS.includes(panel)) throw new Error("panel is invalid");
  return Object.freeze({ ...workspace, activePanel: panel });
}

export function attachWorkspaceChart(workspace: TradingWorkspace, chart: ChartViewport): TradingWorkspace {
  if (workspace.selectedInstrumentId !== undefined && workspace.selectedInstrumentId !== chart.instrumentId) {
    throw new Error("chart instrument does not match selected workspace instrument");
  }
  return Object.freeze({ ...workspace, chart, selectedInstrumentId: chart.instrumentId });
}

export function attachWorkspaceWatchlist(workspace: TradingWorkspace, watchlistId: string): TradingWorkspace {
  return Object.freeze({ ...workspace, watchlistId: nonEmpty(watchlistId, "watchlistId") });
}
