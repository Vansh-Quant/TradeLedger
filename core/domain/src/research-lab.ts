import type { ResearchReport } from "./research-report.js";

export interface ResearchLabRun {
  readonly id: string;
  readonly strategyId: string;
  readonly createdAt: string;
  readonly report: ResearchReport;
}

export interface ResearchLab {
  readonly runs: readonly ResearchLabRun[];
}

export function createResearchLab(): ResearchLab {
  return Object.freeze({ runs: Object.freeze([]) });
}

export function recordResearchRun(
  lab: ResearchLab,
  run: ResearchLabRun,
): ResearchLab {
  if (!run.id.trim() || !run.strategyId.trim()) throw new Error("research run identifiers must not be empty");
  if (!Number.isFinite(Date.parse(run.createdAt))) throw new Error("createdAt must be a valid timestamp");
  if (lab.runs.some((item) => item.id === run.id)) throw new Error("research run id already exists");
  return Object.freeze({ runs: Object.freeze([...lab.runs, Object.freeze(run)]) });
}

export function getResearchRun(
  lab: ResearchLab,
  id: string,
): ResearchLabRun | undefined {
  return lab.runs.find((run) => run.id === id);
}
