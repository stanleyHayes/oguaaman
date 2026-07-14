// Tiny document-head helper for the SPA: set (creating if missing) a
// <meta name=…> or <meta property=…> tag. Used to give each route its own
// title + social/OG tags so pages share nicely. See routes/root.tsx (per-route
// defaults) and pages/VisitPlace.tsx (per-place overrides).

export const DEFAULT_OG_IMAGE = "/og-image.svg";

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
