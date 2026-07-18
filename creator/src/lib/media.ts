/** Resolve a local media path against the API base, leaving remote URLs alone. */
export function mediaUrl(src: string | undefined): string | undefined {
  if (!src) return src;
  if (/^https?:\/\//i.test(src)) return src;
  if (src.startsWith("/")) {
    const base = import.meta.env.VITE_API_URL ?? "";
    return base ? `${base}${src}` : src;
  }
  return src;
}
