import { useEffect } from "react";

/**
 * Mounts a page-specific JSON-LD block and removes it on unmount, so a
 * client-side navigation never leaves another page's structured data behind.
 *
 * The sitewide graph (WebSite / Organization / City) is baked into index.html
 * and prerendered per route — this is only for extra per-page types such as
 * FAQPage. Renders nothing.
 */
export function StructuredData({ data }: Readonly<{ data: unknown }>) {
  // Callers pass an object literal, which is a new reference on every render —
  // depending on `data` itself would tear down and re-append the tag each time.
  // The serialised form is the thing that actually has to change.
  const json = JSON.stringify(data);

  useEffect(() => {
    const tag = document.createElement("script");
    tag.type = "application/ld+json";
    tag.dataset.pageLd = "true";
    tag.textContent = json;
    document.head.appendChild(tag);
    return () => {
      tag.remove();
    };
  }, [json]);

  return null;
}
