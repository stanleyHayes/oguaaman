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
}

export const api = {
  news: () => get<NewsArticle[]>("/api/news"),
  newsArticle: (slug: string) => get<NewsArticle>(`/api/news/${slug}`),
};
