import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Section } from "@/components/ui";
import { PageHero } from "@/components/page-hero";
import { CoastScene } from "@/components/scenes";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { api, type NewsArticle } from "@/lib/api";

function fmt(iso?: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "" : new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function Cover({ a, sizes }: Readonly<{ a: NewsArticle; sizes: "lg" | "sm" }>) {
  const h = sizes === "lg" ? "h-64 sm:h-full sm:min-h-[20rem]" : "h-40";
  if (a.coverImageUrl) {
    return (
      <div className={`relative ${h} w-full overflow-hidden`}>
        <img
          src={a.coverImageUrl}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-green-900/70 via-green-900/10 to-transparent" />
      </div>
    );
  }
  return (
    <div className={`relative ${h} w-full overflow-hidden`} style={{ backgroundColor: a.coverColor ?? "#123F2D" }}>
      <div aria-hidden className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gold-brand/20 blur-2xl" />
    </div>
  );
}

function Meta({ a }: Readonly<{ a: NewsArticle }>) {
  return <p className="text-xs text-ink-faint">{a.authorName} · {fmt(a.publishedAt ?? a.createdAt)}</p>;
}

function FeaturedStory({ a }: Readonly<{ a: NewsArticle }>) {
  return (
    <Link to={`/news/${a.slug}`} className="group grid overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)] lg:grid-cols-[1.05fr_0.95fr]">
      <div className="relative">
        <Cover a={a} sizes="lg" />
        <span className="absolute left-4 top-4 rounded-full bg-gold-brand px-3 py-1 text-[0.66rem] font-bold uppercase tracking-wider text-green-900 shadow-sm">
          Featured story
        </span>
      </div>
      <div className="flex flex-col p-7 sm:p-9">
        <h2 className="text-3xl font-semibold leading-tight text-ink group-hover:text-green sm:text-4xl">{a.title}</h2>
        {a.summary && <p className="mt-4 text-ink-muted">{a.summary}</p>}
        <div className="mt-auto flex items-center justify-between gap-4 border-t border-sand pt-5 text-sm">
          <Meta a={a} />
          <span className="font-semibold text-green transition-transform group-hover:translate-x-0.5">Read story →</span>
        </div>
      </div>
    </Link>
  );
}

function CoverageCard({ a }: Readonly<{ a: NewsArticle }>) {
  return (
    <Link to={`/news/${a.slug}`} className="group flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
      <Cover a={a} sizes="sm" />
      <div className="flex flex-1 flex-col p-6">
        {a.tags?.[0] && (
          <span className="mb-3 self-start rounded-full bg-gold/[0.12] px-2.5 py-0.5 text-[0.66rem] font-bold uppercase tracking-wider text-gold-text">
            {a.tags[0]}
          </span>
        )}
        <h3 className="text-xl font-semibold text-ink group-hover:text-green">{a.title}</h3>
        {a.summary && <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-muted">{a.summary}</p>}
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-sand pt-4 text-xs">
          <Meta a={a} />
          <span className="font-semibold text-green">Read →</span>
        </div>
      </div>
    </Link>
  );
}

export function Component() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [lead, ...rest] = articles;

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

        {lead && (
          <Reveal>
            <FeaturedStory a={lead} />
          </Reveal>
        )}

        {rest.length > 0 && (
          <>
            <div className="mb-5 mt-10">
              <p className="text-[0.66rem] font-bold uppercase tracking-[0.2em] text-gold-text">Latest coverage</p>
              <h2 className="mt-1 text-2xl font-semibold text-ink">From the newsroom</h2>
            </div>
            <Stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((a, idx) => (
                <StaggerItem key={a.id} index={idx}>
                  <CoverageCard a={a} />
                </StaggerItem>
              ))}
            </Stagger>
          </>
        )}
      </Section>
    </>
  );
}
