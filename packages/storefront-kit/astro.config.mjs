import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import tailwindcss from "@tailwindcss/vite";

// Astro SSR on Cloudflare Workers (no static rebuilds — catalog is rendered at
// the edge and cached). Each per-client deploy sets STORE_API_URL to its own
// core Worker; in dev it falls back to the local wrangler dev on :8787.
export default defineConfig({
  output: "server",
  adapter: cloudflare({
    platformProxy: { enabled: true },
  }),
  vite: {
    plugins: [tailwindcss()],
  },
});
