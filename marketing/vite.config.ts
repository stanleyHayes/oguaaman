import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { seoPrerender } from "./plugins/seo-prerender";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // VITE_SITE_URL is the canonical origin (see .env.production). Every
  // canonical, og:url and sitemap entry is built from it, so a wrong value here
  // points search engines at the wrong host — keep the fallback on the live
  // domain rather than a preview URL.
  const env = loadEnv(mode, process.cwd(), "");
  const siteUrl = (env.VITE_SITE_URL || "https://oguaaman.com").replace(/\/+$/, "");

  return {
    plugins: [react(), tailwindcss(), seoPrerender(siteUrl)],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    server: {
      // The live community stats strip reads the same Go backend the portal uses.
      proxy: { "/api": "http://localhost:8080", "/uploads": "http://localhost:8080" },
    },
  };
});
