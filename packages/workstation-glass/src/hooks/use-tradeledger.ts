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
    enabled: !!cfg.baseUrl,
    refetchInterval: 10000,
    retry: false,
  });
}

export function useAccountContext() {
  const cfg = useApiConfig();
  return useQuery({
    queryKey: ["context", cfg.baseUrl, cfg.accountId, cfg.token],
    queryFn: async () => {
      const live = await api.accountContext(cfg.accountId);
      if (live.totalEquity != null || live.positions.length > 0) return live;
      return (await api.workstationDemo(cfg.accountId)).context;
    },
    enabled: isConfigured(cfg),
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
    queryFn: async () => {
      const live = await api.orders(cfg.accountId);
      return live.length > 0 ? live : (await api.workstationDemo(cfg.accountId)).orders;
    },
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
