import { useMemo, useState } from "react";
import { Link, useLoaderData } from "react-router-dom";
import { usePageTitle } from "@/lib/use-page-title";
import type { NewsArticle } from "@/lib/types";
import { api } from "@/lib/api";
import { Container, CTA as Cta, VerifiedBadge } from "@/components/ui";
import { EmptyState, EmptyGlyph } from "@/components/empty-state";
import { LayoutPill, Reveal, Reveal3D, StaggerItem } from "@/components/motion";
import { formatDate } from "@/lib/format";
import { cldCover } from "@/lib/cloudinary";

export async function loader() {
  return api.news();
}

function Cover({ a, sizes }: Readonly<{ a: NewsArticle; sizes: "lg" | "sm" }>) {
  const h = sizes === "lg" ? "h-64 sm:h-full sm:min-h-[22rem]" : "h-40";
  if (a.coverImageUrl) {
    return (
      <div className={`relative ${h} w-full overflow-hidden`}>
        <img src={cldCover(a.coverImageUrl, sizes === "lg" ? 1000 : 600)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-green-900/70 via-green-900/10 to-transparent" />
      </div>
    );
  }
  return (
    <div className={`relative ${h} w-full overflow-hidden`} style={{ backgroundColor: a.coverColor ?? "#123F2D" }}>
      <div aria-hidden className="bg-dotgrid absolute inset-0 opacity-40" />
      <div aria-hidden className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gold-brand/20 blur-2xl" />
    </div>
  );
}

function Meta({ a }: Readonly<{ a: NewsArticle }>) {
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-ink-faint">
      <span>{a.authorName}</span>
      {a.authorVerified && <VerifiedBadge iconOnly verifiedAs={a.authorVerifiedAs} />}
      <span>· {formatDate(a.publishedAt ?? a.createdAt)}</span>
    </p>
  );
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
        <h2 className="text-3xl font-semibold leading-tight text-ink group-hover:text-green-text sm:text-4xl">{a.title}</h2>
        {a.summary && <p className="mt-4 text-ink-muted">{a.summary}</p>}
        <div className="mt-auto flex items-center justify-between gap-4 border-t border-sand pt-5 text-sm">
          <Meta a={a} />
          <span className="font-semibold text-green-text transition-transform group-hover:translate-x-0.5">Read story →</span>
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
        <h3 className="text-xl font-semibold text-ink group-hover:text-green-text">{a.title}</h3>
        {a.summary && <p className="mt-2 line-clamp-3 text-sm text-ink-muted">{a.summary}</p>}
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-sand pt-4 text-xs">
          <Meta a={a} />
          <span className="font-semibold text-green-text">Read →</span>
        </div>
      </div>
    </Link>
  );
}

function TagChips({ tags, active, onPick }: Readonly<{ tags: string[]; active: string | null; onPick: (t: string | null) => void }>) {
  if (tags.length === 0) return null;
  const chip = (on: boolean) =>
    `relative rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
      on ? "text-on-green" : "border border-sand bg-cream text-ink-muted hover:border-green hover:text-green-text"
    }`;
  return (
    <div className="mb-8 flex flex-wrap gap-2">
      <button type="button" onClick={() => onPick(null)} className={chip(active === null)}>
        {active === null && <LayoutPill layoutId="news-tag" className="absolute inset-0 rounded-full bg-green" />}
        <span className="relative">All</span>
      </button>
      {tags.map((t) => (
        <button key={t} type="button" onClick={() => onPick(active === t ? null : t)} className={chip(active === t)}>
          {active === t && <LayoutPill layoutId="news-tag" className="absolute inset-0 rounded-full bg-green" />}
          <span className="relative">#{t}</span>
        </button>
      ))}
    </div>
  );
}

export function Component() {
  const articles = useLoaderData() as NewsArticle[];
  usePageTitle("News");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [lead, ...rest] = articles;
  const tags = useMemo(
    () => [...new Set(articles.flatMap((a) => a.tags ?? []))].sort((x, y) => x.localeCompare(y)),
    [articles],
  );
  const visible = activeTag ? rest.filter((a) => a.tags?.includes(activeTag)) : rest;
  const leadMatches = lead && (!activeTag || lead.tags?.includes(activeTag));

  return (
    <>
      <section className="on-dark on-dark-pin relative overflow-hidden bg-green-900 py-14 text-cream">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-gold-brand/[0.08] blur-3xl" />
        <Container className="relative">
          <Reveal>
            <p className="eyebrow text-gold/80">The Oguaa Newsroom</p>
            <h1 className="mt-2 text-4xl font-semibold sm:text-5xl">News &amp; notices</h1>
            <p className="mt-3 max-w-2xl text-cream/80">Festivals, scholarships, homecomings and announcements — from the community and its institutions.</p>
          </Reveal>
        </Container>
      </section>

      <Container className="py-12">
        {articles.length === 0 ? (
          <EmptyState
            title="No news yet"
            description="When the community and its institutions post, the latest from Oguaa will appear here."
            actions={<Cta to="/" variant="outline">Back to home</Cta>}
          />
        ) : (
          <>
            <TagChips tags={tags} active={activeTag} onPick={setActiveTag} />
            {leadMatches && <Reveal3D><FeaturedStory a={lead} /></Reveal3D>}
            {visible.length > 0 && (
              <>
                <div className="mb-5 mt-10 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[0.66rem] font-bold uppercase tracking-[0.2em] text-gold-text">Latest coverage</p>
                    <h2 className="mt-1 text-2xl font-semibold text-ink">From the newsroom</h2>
                  </div>
                </div>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {visible.map((a, i) => <StaggerItem key={a.id} index={i}><CoverageCard a={a} /></StaggerItem>)}
                </div>
              </>
            )}
            {!leadMatches && visible.length === 0 && (
              <EmptyState icon={<EmptyGlyph name="search" />} title={`Nothing filed under #${activeTag}`} description="Try another tag." />
            )}
          </>
        )}
      </Container>
    </>
  );
}
