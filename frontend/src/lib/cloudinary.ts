// Cloudinary delivery optimisation. Uploaded images are stored as their raw
// secure_url; before rendering we inject transformation params so we serve
// right-sized, auto-format (WebP/AVIF) and auto-quality images. This matters a
// lot for low-bandwidth users (a core constraint for Cape Coast) — a 4 MB phone
// photo dropped into a 48px avatar slot otherwise ships in full.
//
// Local/seed paths (e.g. /uploads/seed/...) are resolved against VITE_API_URL
// so they work both behind the Vite dev proxy and on the Vercel-deployed SPA.

const MARKER = "/image/upload/";

/** Resolve a local media path against the API base, leaving remote URLs alone. */
export function mediaUrl(src: string | undefined): string | undefined {
  if (!src) return src;
  if (/^https?:\/\//i.test(src) || src.startsWith("data:")) return src;
  const base = import.meta.env.VITE_API_URL ?? "";
  const path = src.startsWith("/") ? src : `/${src}`;
  return base ? `${base}${path}` : path;
}

/** Inject a transform string into a Cloudinary delivery URL. No-op otherwise. */
export function cld(url: string | undefined, transform: string): string | undefined {
  if (!url) return url;
  if (!url.includes("res.cloudinary.com")) return mediaUrl(url);
  const i = url.indexOf(MARKER);
  if (i === -1) return mediaUrl(url);
  const head = url.slice(0, i + MARKER.length);
  const tail = url.slice(i + MARKER.length);
  // Don't double-apply if a transform layer is already present.
  if (/^(?:[a-z]{1,3}_[^/]+)(?:,[a-z]{1,3}_[^/]+)*\//.test(tail)) return mediaUrl(url);
  return mediaUrl(`${head}${transform}/${tail}`);
}

const COMMON = "f_auto,q_auto";

/** A fill-cropped cover/banner at a target CSS width (2× for retina). */
export const cldCover = (url: string | undefined, w = 600) =>
  cld(url, `c_fill,w_${w * 2},${COMMON}`);

/** A square, smart-cropped avatar at a target CSS size (2× for retina). */
export const cldAvatar = (url: string | undefined, size = 48) =>
  cld(url, `c_fill,g_auto,w_${size * 2},h_${size * 2},${COMMON}`);

/** A logo/crest scaled to fit (never cropped) within a box (2× for retina). */
export const cldLogo = (url: string | undefined, size = 88) =>
  cld(url, `c_fit,w_${size * 2},h_${size * 2},${COMMON}`);
