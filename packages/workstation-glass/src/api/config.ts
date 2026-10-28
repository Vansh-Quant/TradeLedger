import { useSyncExternalStore } from "react";
import { DEV_DEFAULTS } from "./dev-defaults";

// Runtime connection settings. The bearer token is entered by the user at
// runtime (Settings) and kept in this browser only — never in source code.
export interface ApiConfig {
  baseUrl: string;
  token: string;
  accountId: string;
}

const KEY = "tradeledger.api-config";

// Production defaults never contain a token or a loopback account: the user
// supplies the connection at runtime through Settings or VITE_ variables.
const PRODUCTION_DEFAULTS: ApiConfig = {
  baseUrl: (import.meta.env["VITE_TRADELEDGER_API_URL"] as string | undefined) ?? "",
  token: (import.meta.env["VITE_TRADELEDGER_API_TOKEN"] as string | undefined) ?? "",
  accountId: (import.meta.env["VITE_TRADELEDGER_ACCOUNT_ID"] as string | undefined) ?? "",
};

// The ternary is folded at build time, which also drops the dev-defaults module
// (including the local dev token) from production output.
const DEFAULT: ApiConfig = import.meta.env.DEV ? DEV_DEFAULTS : PRODUCTION_DEFAULTS;

let current: ApiConfig = DEFAULT;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) current = { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
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
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getApiConfig,
    () => DEFAULT,
  );
}

export const isConfigured = (c: ApiConfig) => Boolean(c.baseUrl && c.accountId);
