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
    queryFn: () => api.accountContext(cfg.accountId),
    enabled: isConfigured(cfg),
    refetchInterval: REFRESH,
    retry: 1,
  });
}

export function useOrders() {
  const cfg = useApiConfig();
  return useQuery({
    queryKey: ["orders", cfg.baseUrl, cfg.accountId, cfg.token],
    queryFn: () => api.orders(cfg.accountId),
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
