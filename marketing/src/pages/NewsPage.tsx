import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Section, Card, Pill } from "@/components/ui";
import { PageHero } from "@/components/page-hero";
import { CoastScene } from "@/components/scenes";
import { api, type NewsArticle } from "@/lib/api";

function fmt(iso?: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "" : new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function Component() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    api.news()
      .then((d) => { if (alive) { setArticles(d); setLoaded(true); } })
      .catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);

  return (
    <>
      <PageHero
        scene={CoastScene}
        kicker="The Oguaa Newsroom"
        title="News & notices from Cape Coast."
        lede="Festivals, scholarships, homecomings and announcements — from the community and its institutions. Free to read; no login."
      />
      <Section tone="paper" size="wide" className="min-h-[50vh]">
        {loaded && articles.length === 0 && (
          <p className="mt-4 text-center text-ink-muted">No news yet — check back soon.</p>
        )}

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {articles.map((a) => (
          <Link key={a.id} to={`/news/${a.slug}`} className="group block">
            <Card className="flex h-full flex-col overflow-hidden">
              {a.coverImageUrl ? (
                <div className="relative w-full overflow-hidden" style={{ aspectRatio: "16 / 10" }}>
                  <img src={a.coverImageUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                  <span className="absolute inset-x-0 top-0 h-1.5" style={{ backgroundColor: a.coverColor ?? "#123F2D" }} aria-hidden />
                </div>
              ) : (
                <div className="h-2.5 w-full" style={{ backgroundColor: a.coverColor ?? "#123F2D" }} />
              )}
              <div className="flex flex-1 flex-col p-6">
                {a.tags?.[0] && <Pill tone="gold" className="mb-3 self-start">{a.tags[0]}</Pill>}
                <h3 className="font-display text-xl font-semibold text-ink group-hover:text-green">{a.title}</h3>
                {a.summary && <p className="mt-2 text-sm leading-relaxed text-ink-muted">{a.summary}</p>}
                <p className="mt-4 text-xs text-ink-faint">{a.authorName} · {fmt(a.publishedAt ?? a.createdAt)}</p>
              </div>
            </Card>
          </Link>
        ))}
        </div>
      </Section>
    </>
  );
}
