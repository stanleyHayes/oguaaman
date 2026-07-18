/** Resolve a local media path against the API base, leaving remote URLs alone.
 *  Mirrors the helper in the portal so seed and upload images work behind the
 *  Vite dev proxy and on a standalone Vercel marketing deploy. */
export function mediaUrl(src: string | undefined): string | undefined {
  if (!src) return src;
  if (/^https?:\/\//i.test(src)) return src;
  if (src.startsWith("/")) {
    const base = import.meta.env.VITE_API_URL ?? "";
    return base ? `${base}${src}` : src;
  }
  return src;
}
