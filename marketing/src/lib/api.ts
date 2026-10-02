// Read-only client for the public marketing site. Visitors browse Cape Coast's
// news and content without logging in. In dev, calls hit /api (Vite proxies to
// :8080); in a split deployment (Vercel), VITE_API_URL points at the Render API.
const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

/** Prefix a relative "/api/…" path with the configured API base. Use this for
 *  EVERY fetch in the site so the deployed build reaches the real backend
 *  instead of the marketing origin (which has no /api). */
export function apiUrl(path: string): string {
  return `${BASE}${path}`;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(apiUrl(path), { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Response(`Request failed: ${path}`, { status: res.status });
  return res.json() as Promise<T>;
}

/** One numbered source behind an AI-assisted report (spec section 2.3). */
export interface NewsSource {
  /** Publisher, e.g. "Ghana News Agency". */
  name: string;
  title?: string;
  /** https only; anything else is shown without a link. */
  url: string;
  author?: string;
  publishedAt?: string;
  accessedAt?: string;
  /** The feed lead the report started from. */
  original?: boolean;
}

/** A dated, public correction. Corrections are never silent edits. */
export interface NewsCorrection {
  at: string;
  note: string;
}

export type NewsTier = "brief" | "report";
export type CoverImageKind = "ai" | "branded" | "upload";

export interface NewsArticle {
  id: string;
  slug: string;
  title: string;
  summary?: string;
  body: string;
  coverColor?: string;
  coverImageUrl?: string;
  tags?: string[];
  authorName: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt?: string;

  // Automated newsroom (feed briefs and AI-assisted reports).
  automated?: boolean;
  automationLabel?: string;
  sourceName?: string;
  sourceUrl?: string;
  sourcePublishedAt?: string;
  /** The original reporter from the feed: "By {author} for {source}". */
  sourceAuthor?: string;

  // Section 4.1 additions.
  tier?: NewsTier;
  /** Numbered 1..n; matches the [n] markers in `body`. */
  sources?: NewsSource[];
  topics?: string[];
  political?: boolean;
  coverImageKind?: CoverImageKind;
  coverImageAlt?: string;
  coverImageCredit?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  corrections?: NewsCorrection[];
}

export const api = {
  news: () => get<NewsArticle[]>("/api/news"),
  newsArticle: (slug: string) => get<NewsArticle>(`/api/news/${slug}`),
};
