import { beforeEach, describe, expect, it, vi } from "vitest";

const accountContext = vi.fn();
const orders = vi.fn();
const workstationDemo = vi.fn();

vi.mock("@/api/client", () => ({
  api: {
    accountContext: (...args: unknown[]) => accountContext(...args),
    orders: (...args: unknown[]) => orders(...args),
    workstationDemo: (...args: unknown[]) => workstationDemo(...args),
  },
}));

import { loadLiveAccountContext, loadLiveOrders } from "@/hooks/use-tradeledger";

describe("live data loaders", () => {
  beforeEach(() => {
    accountContext.mockReset();
    orders.mockReset();
    workstationDemo.mockReset();
  });

  it("returns empty live context without substituting demo fixtures", async () => {
    const empty = { accountId: "ACC-APP", positions: [], executions: [], limits: {} };
    accountContext.mockResolvedValue(empty);

    await expect(loadLiveAccountContext("ACC-APP")).resolves.toBe(empty);
    expect(workstationDemo).not.toHaveBeenCalled();
  });

  it("returns an empty live order list without substituting demo fixtures", async () => {
    orders.mockResolvedValue([]);

    await expect(loadLiveOrders("ACC-APP")).resolves.toEqual([]);
    expect(workstationDemo).not.toHaveBeenCalled();
  });
});
