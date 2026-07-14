// Cloudinary delivery optimisation — inject right-sizing + auto format/quality
// into uploaded image URLs before rendering. Pasted (non-Cloudinary) URLs pass
// through unchanged. Mirrors frontend/src/lib/cloudinary.ts.

const MARKER = "/image/upload/";

export function cld(url: string | undefined, transform: string): string | undefined {
  if (!url || !url.includes("res.cloudinary.com")) return url;
  const i = url.indexOf(MARKER);
  if (i === -1) return url;
  const head = url.slice(0, i + MARKER.length);
  const tail = url.slice(i + MARKER.length);
  if (/^(?:[a-z]{1,3}_[^/]+)(?:,[a-z]{1,3}_[^/]+)*\//.test(tail)) return url;
  return `${head}${transform}/${tail}`;
}

const COMMON = "f_auto,q_auto";

export const cldCover = (url: string | undefined, w = 600) =>
  cld(url, `c_fill,w_${w * 2},${COMMON}`);

export const cldAvatar = (url: string | undefined, size = 48) =>
  cld(url, `c_fill,g_auto,w_${size * 2},h_${size * 2},${COMMON}`);

export const cldLogo = (url: string | undefined, size = 88) =>
  cld(url, `c_fit,w_${size * 2},h_${size * 2},${COMMON}`);
