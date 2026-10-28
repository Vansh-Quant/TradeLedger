import type { ApiConfig } from "./config";

/**
 * Development-only connection defaults.
 *
 * This module is referenced exclusively from a branch guarded by
 * `import.meta.env.DEV`, so it is removed from production bundles. The token is
 * the local dev-server token, never a production credential.
 */
export const DEV_DEFAULTS: ApiConfig = {
  baseUrl:
    (import.meta.env["VITE_TRADELEDGER_API_URL"] as string | undefined) ?? "http://127.0.0.1:3000",
  token: (import.meta.env["VITE_TRADELEDGER_API_TOKEN"] as string | undefined) ?? "dev-token",
  accountId: (import.meta.env["VITE_TRADELEDGER_ACCOUNT_ID"] as string | undefined) ?? "ACC-APP",
};
