import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

// A per-deploy id. The service worker is registered as /sw.js?v=<id>, so each
// deploy installs a fresh worker that re-caches the shell and prunes old caches.
const BUILD_ID = (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.RENDER_GIT_COMMIT ?? Date.now().toString(36)).slice(0, 12);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { "import.meta.env.VITE_BUILD_ID": JSON.stringify(BUILD_ID) },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    // Proxy API calls to the Go backend in dev (no CORS, relative /api paths).
    proxy: { "/api": "http://localhost:8080", "/uploads": "http://localhost:8080" },
  },
});
