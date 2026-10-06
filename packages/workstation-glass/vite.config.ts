// @lovable.dev/vite-tanstack-config provides the TanStack Start, React,
// Tailwind, path-resolution, and development plugins used by this workstation.
// We keep its plugin stack and explicitly pin Nitro to the Node server preset
// for local TradeLedger development and standalone Node deployments.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  nitro: {
    preset: "node-server",
  },
});
