import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Container } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { api, type NewsArticle } from "@/lib/api";

function fmt(iso?: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "" : new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function Component() {
  const { slug } = useParams<{ slug: string }>();
  const [article, setArticle] = useState<NewsArticle | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    if (!slug) return;
    let alive = true;
    api.newsArticle(slug)
      .then((a) => { if (alive) { setArticle(a); setState("ready"); } })
      .catch(() => { if (alive) setState("missing"); });
    return () => { alive = false; };
  }, [slug]);

  if (state === "loading") {
    return <div className="flex min-h-screen items-center justify-center bg-paper pt-20 text-ink-faint">Loading…</div>;
  }
  if (state === "missing" || !article) {
    return (
      <div className="min-h-screen bg-paper">
        <Container size="narrow" className="flex min-h-screen flex-col items-center justify-center pt-20 text-center">
          <h1 className="font-display text-3xl font-semibold text-ink">Article not found</h1>
          <Link to="/news" className="mt-5 rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-cream">← Newsroom</Link>
        </Container>
      </div>
    );
  }

  return (
    <article className="min-h-screen bg-paper">
      {article.coverImageUrl ? (
        <div className="relative w-full pt-16">
          <img src={article.coverImageUrl} alt="" className="h-64 w-full object-cover sm:h-96" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          <span className="absolute inset-x-0 top-16 h-1.5" style={{ backgroundColor: article.coverColor ?? "#123F2D" }} aria-hidden />
        </div>
      ) : (
        <div className="h-2 w-full" style={{ backgroundColor: article.coverColor ?? "#123F2D" }} />
      )}
      <Container size="prose" className={article.coverImageUrl ? "pb-16 pt-10" : "pb-16 pt-24"}>
        <Link to="/news" className="text-sm font-medium text-teal-text hover:underline">← Newsroom</Link>
        <h1 className="mt-4 font-display text-4xl font-semibold leading-tight text-ink sm:text-5xl">{article.title}</h1>
        {article.summary && <p className="mt-4 font-serif text-xl italic text-ink-muted">{article.summary}</p>}
        <p className="mt-4 border-b border-sand pb-6 text-sm text-ink-faint">By {article.authorName} · {fmt(article.publishedAt ?? article.createdAt)}</p>
        <div className="mt-6"><Markdown>{article.body}</Markdown></div>
      </Container>
    </article>
  );
}
