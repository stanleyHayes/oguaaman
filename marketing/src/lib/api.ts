// Read-only client for the public marketing site. Visitors browse Cape Coast's
// news and content without logging in. Calls hit /api (Vite proxies to :8080).
const BASE = import.meta.env.VITE_API_URL ?? "";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { Accept: "application/json" } });
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
