// The locked Lovable wrapper supplies TanStack Start, React, Tailwind, path aliases,
// Nitro/Cloudflare output, and preview integration. Avoid duplicate plugins.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  // Use the shared server wrapper for consistent, actionable SSR error reporting.
  tanstackStart: {
    server: { entry: "server" },
  },
});
