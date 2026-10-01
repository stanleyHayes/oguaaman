// Tiny document-head helper for the SPA: set (creating if missing) a
// <meta name=…> or <meta property=…> tag. Used to give each route its own
// title + social/OG tags so pages share nicely. See routes/root.tsx (per-route
// defaults) and pages/VisitPlace.tsx / NewsArticlePage.tsx (per-item overrides).
import { SITE_URL } from "@/config";
import { mediaUrl } from "./media";

// PNG, not SVG: link-preview scrapers refuse SVG, and this must agree with the
// prerendered head (plugins/seo-prerender.ts), which declares image/png.
export const DEFAULT_OG_IMAGE = "/og-image.png";
/** The default image's own type and size (public/og-image.png). */
export const DEFAULT_OG_IMAGE_META = { "og:image:type": "image/png", "og:image:width": "1200", "og:image:height": "630" } as const;

/** Absolute URL for a share image — scrapers need one, never a bare path. */
export function absoluteImageUrl(src: string | undefined): string | undefined {
  const resolved = mediaUrl(src);
  if (!resolved) return undefined;
  try {
    return new URL(resolved, `${SITE_URL}/`).href;
  } catch {
    return undefined;
  }
}

/** Title, description and (optionally) share image for a single item page. */
export function setPageMeta({ title, description, image }: Readonly<{ title: string; description: string; image?: string }>) {
  document.title = title;
  setMeta("property", "og:title", title);
  setMeta("name", "twitter:title", title);
  setMeta("name", "description", description);
  setMeta("property", "og:description", description);
  setMeta("name", "twitter:description", description);
  const abs = absoluteImageUrl(image);
  if (abs) {
    setMeta("property", "og:image", abs);
    setMeta("name", "twitter:image", abs);
    // The default image's type and size no longer describe this one.
    for (const key of Object.keys(DEFAULT_OG_IMAGE_META)) removeMeta("property", key);
  }
}

export function removeMeta(attr: "name" | "property", key: string) {
  document.head.querySelector(`meta[${attr}="${key}"]`)?.remove();
}

export function setMeta(attr: "name" | "property", key: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

/** Set (creating if missing) a <link rel=…> — e.g. the canonical URL. */
export function setLink(rel: string, href: string) {
  let tag = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!tag) {
    tag = document.createElement("link");
    tag.setAttribute("rel", rel);
    document.head.appendChild(tag);
  }
  tag.setAttribute("href", href);
}
