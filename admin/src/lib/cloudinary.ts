// Cloudinary delivery optimisation — inject right-sizing + auto format/quality
// into uploaded image URLs before rendering. Pasted (non-Cloudinary) URLs pass
// through unchanged. Local/seed paths are resolved against VITE_API_URL so they
// work behind the dev proxy and on standalone SPA deploys.

const MARKER = "/image/upload/";

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

export function cld(url: string | undefined, transform: string): string | undefined {
  if (!url) return url;
  if (!url.includes("res.cloudinary.com")) return mediaUrl(url);
  const i = url.indexOf(MARKER);
  if (i === -1) return mediaUrl(url);
  const head = url.slice(0, i + MARKER.length);
  const tail = url.slice(i + MARKER.length);
  if (/^(?:[a-z]{1,3}_[^/]+)(?:,[a-z]{1,3}_[^/]+)*\//.test(tail)) return mediaUrl(url);
  return mediaUrl(`${head}${transform}/${tail}`);
}

const COMMON = "f_auto,q_auto";

export const cldCover = (url: string | undefined, w = 600) =>
  cld(url, `c_fill,w_${w * 2},${COMMON}`);

export const cldAvatar = (url: string | undefined, size = 48) =>
  cld(url, `c_fill,g_auto,w_${size * 2},h_${size * 2},${COMMON}`);

export const cldLogo = (url: string | undefined, size = 88) =>
  cld(url, `c_fit,w_${size * 2},h_${size * 2},${COMMON}`);
