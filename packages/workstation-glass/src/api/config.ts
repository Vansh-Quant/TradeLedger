import { useSyncExternalStore } from "react";

// Runtime connection settings. The bearer token is entered by the user at
// runtime (Settings) and kept in this browser only — never in source code.
export interface ApiConfig {
  baseUrl: string;
  token: string;
  accountId: string;
}

const KEY = "tradeledger.api-config";
const DEFAULT: ApiConfig = {
  baseUrl: (import.meta.env['VITE_TRADELEDGER_API_URL'] as string | undefined) ?? "",
  token: "",
  accountId: (import.meta.env['VITE_TRADELEDGER_ACCOUNT_ID'] as string | undefined) ?? "",
};

let current: ApiConfig = DEFAULT;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) current = { ...DEFAULT, ...JSON.parse(raw) };
  } catch { /* ignore */ }
}

export function getApiConfig(): ApiConfig {
  load();
  return current;
}

export function setApiConfig(next: Partial<ApiConfig>) {
  current = { ...getApiConfig(), ...next };
  window.localStorage.setItem(KEY, JSON.stringify(current));
  listeners.forEach((l) => l());
}

export function useApiConfig(): ApiConfig {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    getApiConfig,
    () => DEFAULT,
  );
}

export const isConfigured = (c: ApiConfig) => Boolean(c.baseUrl && c.accountId);
