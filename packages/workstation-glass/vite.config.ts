// @lovable.dev/vite-tanstack-config supplies the TanStack, React, Tailwind and path plugins.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    server: {
      port: 4173,
      strictPort: true,
    },
  },
  tanstackStart: {
    server: { entry: "server" },
  },
});
