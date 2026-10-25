import { beforeEach, describe, expect, it, vi } from "vitest";

const accountContext = vi.fn();
const orders = vi.fn();

vi.mock("@/api/client", () => ({
  api: {
    accountContext: (...args: unknown[]) => accountContext(...args),
    orders: (...args: unknown[]) => orders(...args),
  },
}));

import { loadLiveAccountContext, loadLiveOrders } from "@/hooks/use-tradeledger";

describe("live data loaders", () => {
  beforeEach(() => {
    accountContext.mockReset();
    orders.mockReset();
  });

  it("returns the live account context unchanged, including empty positions", async () => {
    const empty = { accountId: "ACC-APP", positions: [], executions: [], limits: {} };
    accountContext.mockResolvedValue(empty);

    await expect(loadLiveAccountContext("ACC-APP")).resolves.toBe(empty);
  });

  it("returns the live order list unchanged when no orders exist", async () => {
    orders.mockResolvedValue([]);

    await expect(loadLiveOrders("ACC-APP")).resolves.toEqual([]);
  });
});
