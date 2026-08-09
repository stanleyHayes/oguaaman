import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { Plugin } from "vite";
import { ROUTE_SEO, type RouteSeo } from "../src/seo/routes";
import { DEFAULT_TITLE, DEFAULT_DESCRIPTION, mergeKeywords, siteGraph, breadcrumbGraph } from "../src/seo/site";

/**
 * Build-time SEO for a client-rendered SPA.
 *
 * A crawler's first fetch of an SPA gets one HTML file: every route shares a
 * single title, description and canonical, and social scrapers (Facebook,
 * WhatsApp, LinkedIn, X) never run the JavaScript that would fix that — so
 * every shared link previews identically no matter what was shared.
 *
 * This plugin emits a real HTML file per static route — dist/history/index.html
 * and so on — each with its own head and a no-JS shell. Vercel's filesystem
 * handler serves those directly (see vercel.json), and the SPA fallback still
 * catches dynamic routes like /news/:slug. It also emits sitemap.xml and
 * robots.txt from the same route table, so they cannot drift from the router.
 *
 * The body is NOT server-rendered: React still hydrates on the client. What a
 * crawler gets up front is the head — titles, canonicals, structured data —
 * plus the no-JS shell, which is what fixes ranking signals and share previews.
 */

const MARK = { start: "<!--seo:start-->", end: "<!--seo:end-->" };
const SHELL = { start: "<!--seo:shell-start-->", end: "<!--seo:shell-end-->" };

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** JSON-LD is escaped for the one sequence that can break out of a script tag. */
const ld = (data: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;

const trimSlash = (s: string) => s.replace(/\/+$/, "");

const HOME: RouteSeo = {
  path: "/",
  title: DEFAULT_TITLE,
  description: DEFAULT_DESCRIPTION,
  h1: "This is Oguaa — the home of Cape Coast",
  changefreq: "daily",
  priority: 1,
};

/** The full <head> SEO block for one route. */
function headFor(route: RouteSeo, siteUrl: string): string {
  const site = trimSlash(siteUrl);
  const url = route.path === "/" ? `${site}/` : `${site}${route.path}`;
  // PNG, not SVG: Facebook, WhatsApp, LinkedIn, X, Slack and iMessage all
  // refuse SVG for link previews, so an .svg og:image silently never renders.
  const image = `${site}/og-image.png`;
  const keywords = mergeKeywords(route.keywords);

  const tags = [
    `<title>${esc(route.title)}</title>`,
    `<meta name="description" content="${esc(route.description)}" />`,
    `<meta name="keywords" content="${esc(keywords)}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta name="robots" content="index, follow, max-image-preview:large" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Oguaa" />`,
    `<meta property="og:title" content="${esc(route.title)}" />`,
    `<meta property="og:description" content="${esc(route.description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta property="og:image:type" content="image/png" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:locale" content="en_GH" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(route.title)}" />`,
    `<meta name="twitter:description" content="${esc(route.description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
    ld(siteGraph(site)),
  ];
  if (route.path !== "/") tags.push(ld(breadcrumbGraph(site, route.path, route.h1)));
  return tags.join("\n    ");
}

/**
 * A no-JS shell: the page's heading and summary, plus links to every section.
 *
 * Honest fallback content, not hidden text — it is what a reader without
 * JavaScript actually gets, and it gives non-rendering crawlers a real title,
 * a real summary and a crawlable path to every other page.
 */
function shellFor(route: RouteSeo): string {
  const links = ROUTE_SEO.filter((r) => r.path !== route.path && r.priority >= 0.4)
    .map((r) => `<li><a href="${r.path}">${esc(r.h1)}</a></li>`)
    .join("");
  return [
    "<noscript>",
    `<h1>${esc(route.h1)}</h1>`,
    `<p>${esc(route.description)}</p>`,
    "<p>Oguaa needs JavaScript for the full experience. These pages are also available:</p>",
    `<ul>${links}</ul>`,
    "</noscript>",
  ].join("");
}

function applyRoute(html: string, route: RouteSeo, siteUrl: string): string {
  const head = `${MARK.start}\n    ${headFor(route, siteUrl)}\n    ${MARK.end}`;
  const shell = `${SHELL.start}${shellFor(route)}${SHELL.end}`;
  return html
    .replace(new RegExp(`${MARK.start}[\\s\\S]*?${MARK.end}`), () => head)
    .replace(new RegExp(`${SHELL.start}[\\s\\S]*?${SHELL.end}`), () => shell);
}

function sitemap(siteUrl: string, lastmod: string): string {
  const site = trimSlash(siteUrl);
  const urls = ROUTE_SEO.map((r) => {
    const loc = r.path === "/" ? `${site}/` : `${site}${r.path}`;
    return `  <url><loc>${loc}</loc><lastmod>${lastmod}</lastmod><changefreq>${r.changefreq}</changefreq><priority>${r.priority.toFixed(1)}</priority></url>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Generated at build time from src/seo/routes.ts — do not edit by hand. -->\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function robots(siteUrl: string): string {
  const site = trimSlash(siteUrl);
  return [
    "# Generated at build time — see plugins/seo-prerender.ts",
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${site}/sitemap.xml`,
    "",
  ].join("\n");
}

export function seoPrerender(siteUrl: string): Plugin {
  let dist = "dist";
  return {
    name: "oguaa-seo-prerender",

    configResolved(config) {
      dist = resolve(config.root, config.build.outDir);
    },

    // Dev and build both get the home route's head, so what you see locally is
    // what ships. Per-route heads are written in closeBundle.
    transformIndexHtml(html) {
      return applyRoute(html, HOME, siteUrl);
    },

    async closeBundle() {
      const indexPath = join(dist, "index.html");

      let template: string;
      try {
        template = await readFile(indexPath, "utf8");
      } catch {
        // `vite build --ssr` and friends have no index.html — nothing to do.
        return;
      }
      if (!template.includes(MARK.start)) {
        this.warn("index.html is missing the <!--seo:start--> markers — per-route heads were not written.");
        return;
      }

      const lastmod = new Date().toISOString().slice(0, 10);

      for (const route of ROUTE_SEO) {
        const html = applyRoute(template, route, siteUrl);
        if (route.path === "/") {
          await writeFile(indexPath, html, "utf8");
          continue;
        }
        // Both shapes, because static hosts disagree on which one a clean URL
        // resolves to: some look for `<path>/index.html`, others `<path>.html`.
        // Writing both means /history serves the right head either way, and
        // costs a few KB.
        for (const file of [join(dist, route.path.slice(1), "index.html"), `${join(dist, route.path.slice(1))}.html`]) {
          await mkdir(dirname(file), { recursive: true });
          await writeFile(file, html, "utf8");
        }
      }

      await writeFile(join(dist, "sitemap.xml"), sitemap(siteUrl, lastmod), "utf8");
      await writeFile(join(dist, "robots.txt"), robots(siteUrl), "utf8");

      this.info?.(`SEO: prerendered ${ROUTE_SEO.length} routes + sitemap.xml + robots.txt for ${siteUrl}`);
    },
  };
}
