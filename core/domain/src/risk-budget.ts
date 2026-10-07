export interface RiskBudgetEntry {
  readonly id:string;
  readonly budget:number;
}
export function validateRiskBudgets(
  entries: readonly RiskBudgetEntry[],
): readonly string[] {
  const failures:string[]=[];
  const total=entries.reduce((s,e)=>s+e.budget,0);
  if(entries.length===0) failures.push("risk budget must not be empty");
  if(entries.some(e=>!e.id.trim()||!Number.isFinite(e.budget)||e.budget<0)) failures.push("risk budgets must be non-negative and finite");
  if(total>1+1e-12) failures.push("risk budget total cannot exceed 1");
  if(new Set(entries.map(e=>e.id)).size!==entries.length) failures.push("risk budget ids must be unique");
  return Object.freeze(failures);
}
