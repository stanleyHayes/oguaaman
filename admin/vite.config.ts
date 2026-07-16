import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

// Oguaa admin platform — back-office SPA. Dev on :5174, proxies /api → Go :8080.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    port: 5174,
    proxy: { "/api": "http://localhost:8080", "/uploads": "http://localhost:8080" },
  },
});
