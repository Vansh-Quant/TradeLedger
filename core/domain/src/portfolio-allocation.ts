export interface StrategyAllocation {
  readonly strategyId: string;
  readonly weight: number;
}

export interface PortfolioAllocation {
  readonly allocations: readonly StrategyAllocation[];
  readonly totalWeight: number;
}

export function createPortfolioAllocation(
  allocations: readonly StrategyAllocation[],
): PortfolioAllocation {
  if (allocations.length === 0) throw new Error("allocations must not be empty");
  const normalized = allocations.map((allocation) => {
    if (!allocation.strategyId.trim()) throw new Error("strategyId must not be empty");
    if (!Number.isFinite(allocation.weight) || allocation.weight < 0) {
      throw new Error("allocation weight must be non-negative and finite");
    }
    return Object.freeze({ strategyId: allocation.strategyId.trim(), weight: allocation.weight });
  });
  const totalWeight = normalized.reduce((sum, allocation) => sum + allocation.weight, 0);
  if (totalWeight <= 0) throw new Error("total allocation weight must be positive");
  if (totalWeight > 1 + 1e-12) throw new Error("total allocation weight cannot exceed 1");
  return Object.freeze({
    allocations: Object.freeze(normalized),
    totalWeight,
  });
}

export function normalizePortfolioAllocation(
  allocation: PortfolioAllocation,
): PortfolioAllocation {
  const total = allocation.totalWeight;
  return createPortfolioAllocation(
    allocation.allocations.map((item) => ({
      strategyId: item.strategyId,
      weight: item.weight / total,
    })),
  );
}
