import type { AccountPortfolio } from "./account-portfolio.js";
import type { Execution } from "./execution.js";
import {
  createExecutionReconciliation,
  reconcileExecution,
  type ExecutionReconciliation,
} from "./execution-reconciliation.js";
import type { Order } from "./order.js";

export interface ExecutionReplayInput {
  readonly order: Order;
  readonly accountPortfolio: AccountPortfolio;
  readonly executions: readonly Execution[];
}

export interface ExecutionReplayResult {
  readonly state: ExecutionReconciliation;
  readonly appliedExecutionCount: number;
  readonly duplicateExecutionCount: number;
}

/**
 * Rebuilds order and portfolio state deterministically from recorded executions.
 *
 * The replay path uses the same reconciliation rules as live processing rather
 * than maintaining a second set of position/fill calculations.
 */
export function replayExecutions(
  input: ExecutionReplayInput,
): ExecutionReplayResult {
  let state = createExecutionReconciliation(
    input.order,
    input.accountPortfolio,
  );
  let appliedExecutionCount = 0;
  let duplicateExecutionCount = 0;

  for (const execution of input.executions) {
    const result = reconcileExecution(state, execution);
    state = result.state;

    if (result.applied) {
      appliedExecutionCount += 1;
    }

    if (result.duplicate) {
      duplicateExecutionCount += 1;
    }
  }

  return Object.freeze({
    state,
    appliedExecutionCount,
    duplicateExecutionCount,
  });
}
