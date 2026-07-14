// Cloudinary delivery optimisation for mobile — inject right-sizing + auto
// format/quality into uploaded image URLs before rendering. Critical for the
// data plans of phones in Cape Coast: a 4 MB upload is delivered as a small
// WebP/AVIF instead of full resolution. Non-Cloudinary URLs pass through.

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

/** A fill-cropped cover/banner at a target px width (2× for retina). */
export const cldCover = (url: string | undefined, w = 600) =>
  cld(url, `c_fill,w_${w * 2},${COMMON}`);
