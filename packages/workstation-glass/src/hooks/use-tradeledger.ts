import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { isConfigured, useApiConfig } from "@/api/config";
import type { SubmitOrderIntent } from "@/api/types";

const REFRESH = 5000;

export function useHealth() {
  const cfg = useApiConfig();
  return useQuery({
    queryKey: ["health", cfg.baseUrl],
    queryFn: async () => {
      const [h, r] = await Promise.allSettled([api.health(), api.ready()]);
      return { health: h.status === "fulfilled", ready: r.status === "fulfilled" };
    },
    enabled: !!cfg.baseUrl && typeof window !== "undefined",
    refetchInterval: 10000,
    retry: false,
  });
}

/** Live account context only. Empty accounts stay empty; demo fixtures are never substituted. */
export function loadLiveAccountContext(accountId: string) {
  return api.accountContext(accountId);
}

/** Live order list only. An empty blotter is a valid backend result. */
export function loadLiveOrders(accountId: string) {
  return api.orders(accountId);
}

/** Authoritative market-data states only. Empty means nothing was ingested. */
export function loadMarketData(accountId: string) {
  return api.marketData(accountId);
}

export function useAccountContext() {
  const cfg = useApiConfig();
  return useQuery({
    queryKey: ["context", cfg.baseUrl, cfg.accountId, cfg.token],
    queryFn: () => loadLiveAccountContext(cfg.accountId),
    enabled: isConfigured(cfg) && typeof window !== "undefined",
    refetchInterval: REFRESH,
    retry: 1,
  });
}

export function useWorkstationDemo() {
  const cfg = useApiConfig();
  return useQuery({
    queryKey: ["workstation-demo", cfg.baseUrl, cfg.accountId, cfg.token],
    queryFn: () => api.workstationDemo(cfg.accountId),
    enabled: isConfigured(cfg),
    staleTime: 1000,
    refetchInterval: REFRESH,
    retry: 1,
  });
}

export function useOrders() {
  const cfg = useApiConfig();
  return useQuery({
    queryKey: ["orders", cfg.baseUrl, cfg.accountId, cfg.token],
    queryFn: () => loadLiveOrders(cfg.accountId),
    enabled: isConfigured(cfg),
    refetchInterval: REFRESH,
    retry: 1,
  });
}

export function useMarketData() {
  const cfg = useApiConfig();
  return useQuery({
    queryKey: ["market-data", cfg.baseUrl, cfg.accountId, cfg.token],
    queryFn: () => loadMarketData(cfg.accountId),
    enabled: isConfigured(cfg),
    refetchInterval: REFRESH,
    retry: 1,
  });
}

export function useSubmitOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (i: SubmitOrderIntent) => api.submitOrder(i),
    onSettled: () => { qc.invalidateQueries({ queryKey: ["orders"] }); qc.invalidateQueries({ queryKey: ["context"] }); },
  });
}

export function useCancelOrder() {
  const qc = useQueryClient();
  const cfg = useApiConfig();
  return useMutation({
    mutationFn: (orderId: string) => api.cancelOrder(orderId, cfg.accountId),
    onSettled: () => qc.invalidateQueries({ queryKey: ["orders"] }),
  });
}
