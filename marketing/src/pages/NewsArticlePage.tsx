import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Container } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { Reveal } from "@/components/motion";
import { api, type NewsArticle } from "@/lib/api";
import { mediaUrl } from "@/lib/media";

function fmt(iso?: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "" : new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function ArticleSkeleton() {
  return (
    <div className="min-h-screen bg-paper">
      <div className="h-64 w-full animate-pulse bg-sand sm:h-96" />
      <Container size="prose" className="relative z-10 -mt-16 pb-16">
        <div className="rounded-[var(--radius-card)] border border-sand bg-cream p-7 shadow-[var(--shadow-lift)] sm:p-10">
          <div className="h-8 w-24 animate-pulse rounded-full bg-sand" />
          <div className="mt-5 h-10 w-3/4 animate-pulse rounded-md bg-sand" />
          <div className="mt-4 h-5 w-1/2 animate-pulse rounded-md bg-sand" />
        </div>
      </Container>
    </div>
  );
}

function ArticleCover({ a }: Readonly<{ a: NewsArticle }>) {
  if (a.coverImageUrl) {
    return (
      <div className="relative h-64 w-full overflow-hidden pt-16 sm:h-96">
        <img
          src={mediaUrl(a.coverImageUrl)}
          alt=""
          className="h-full w-full object-cover"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
        <div aria-hidden className="absolute inset-0 top-16 bg-gradient-to-t from-green-900/80 via-green-900/20 to-transparent" />
      </div>
    );
  }
  return (
    <div className="relative h-40 w-full overflow-hidden pt-16 sm:h-56" style={{ backgroundColor: a.coverColor ?? "#123F2D" }}>
      <div aria-hidden className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gold-brand/20 blur-3xl" />
    </div>
  );
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

  if (state === "loading") return <ArticleSkeleton />;

  if (state === "missing" || !article) {
    return (
      <div className="min-h-screen bg-paper">
        <Container size="narrow" className="flex min-h-screen flex-col items-center justify-center pt-20 text-center">
          <h1 className="text-3xl font-semibold text-ink">Article not found</h1>
          <Link to="/news" className="mt-5 rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-cream">← Newsroom</Link>
        </Container>
      </div>
    );
  }

  const tags = article.tags ?? [];
  return (
    <article className="min-h-screen bg-paper">
      <ArticleCover a={article} />
      <Container size="prose" className="relative z-10 -mt-16 pb-16">
        <Reveal>
          <div className="rounded-[var(--radius-card)] border border-sand bg-cream p-7 shadow-[var(--shadow-lift)] sm:p-10">
            <Link to="/news" className="inline-flex items-center gap-1.5 rounded-full border border-sand bg-paper px-3.5 py-1.5 text-sm font-medium text-teal-text transition-colors hover:border-teal hover:bg-teal/[0.06]">
              ← Newsroom
            </Link>
            <h1 className="mt-5 text-4xl font-semibold leading-tight text-ink sm:text-5xl">{article.title}</h1>
            {article.summary && <p className="mt-4 font-serif text-xl italic text-ink-muted">{article.summary}</p>}
            <p className="mt-6 border-t border-sand pt-5 text-sm text-ink-faint">By {article.authorName} · {fmt(article.publishedAt ?? article.createdAt)}</p>
          </div>
        </Reveal>
        <div className="mt-10"><Markdown>{article.body}</Markdown></div>
        {tags.length > 0 && (
          <div className="mt-10 flex flex-wrap gap-2 border-t border-sand pt-6">
            {tags.map((t) => (
              <span key={t} className="rounded-full bg-green/[0.07] px-3 py-1 text-xs font-medium text-green">#{t}</span>
            ))}
          </div>
        )}
      </Container>
    </article>
  );
}
