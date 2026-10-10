import type { AccountPortfolio } from "./account-portfolio.js";
import { applyExecutionToAccountPortfolio } from "./account-portfolio.js";
import type { Execution } from "./execution.js";
import type { Order } from "./order.js";
import { recordOrderFill } from "./order-lifecycle.js";

export interface ExecutionReconciliation {
  readonly order: Order;
  readonly accountPortfolio: AccountPortfolio;
  readonly appliedExecutionIds: ReadonlySet<string>;
  /** Canonical payloads let retries distinguish true duplicates from ID conflicts. */
  readonly appliedExecutionPayloads?: ReadonlyMap<string, string>;
}

export interface ReconciliationResult {
  readonly state: ExecutionReconciliation;
  readonly applied: boolean;
  readonly duplicate: boolean;
}

function assertOrderMatchesExecution(order: Order, execution: Execution): void {
  if (execution.orderId !== order.id) throw new Error("execution orderId does not match order id");
  if (execution.instrumentId !== order.instrumentId) throw new Error("execution instrumentId does not match order instrument");
  if (execution.side !== order.side) throw new Error("execution side does not match order side");
  if (Date.parse(execution.executedAt) < Date.parse(order.createdAt)) {
    throw new Error("execution executedAt cannot precede order createdAt");
  }
}

export function createExecutionReconciliation(order: Order, accountPortfolio: AccountPortfolio): ExecutionReconciliation {
  if (order.accountId !== accountPortfolio.accountId) throw new Error("order accountId does not match account portfolio");
  return Object.freeze({
    order,
    accountPortfolio,
    appliedExecutionIds: new Set<string>(),
    appliedExecutionPayloads: new Map<string, string>(),
  });
}

export function reconcileExecution(state: ExecutionReconciliation, execution: Execution): ReconciliationResult {
  assertOrderMatchesExecution(state.order, execution);

  if (state.appliedExecutionIds.has(execution.id)) {
    const priorPayload = state.appliedExecutionPayloads?.get(execution.id);
    if (priorPayload !== undefined && priorPayload !== JSON.stringify(execution)) {
      throw new Error("execution id already exists with different execution data");
    }
    return Object.freeze({ state, applied: false, duplicate: true });
  }

  const nextOrder = recordOrderFill(state.order, execution.quantity);
  const nextAccountPortfolio = applyExecutionToAccountPortfolio(state.accountPortfolio, execution);
  const appliedExecutionIds = new Set(state.appliedExecutionIds);
  appliedExecutionIds.add(execution.id);
  const appliedExecutionPayloads = new Map(state.appliedExecutionPayloads ?? []);
  appliedExecutionPayloads.set(execution.id, JSON.stringify(execution));

  return Object.freeze({
    state: Object.freeze({
      order: nextOrder,
      accountPortfolio: nextAccountPortfolio,
      appliedExecutionIds,
      appliedExecutionPayloads,
    }),
    applied: true,
    duplicate: false,
  });
}