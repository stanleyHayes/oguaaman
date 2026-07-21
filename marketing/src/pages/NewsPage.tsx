import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHero } from "@/components/page-hero";
import { Container } from "@/components/ui";
import { CoastScene } from "@/components/scenes";
import { Reveal } from "@/components/motion";
import { api, type NewsArticle } from "@/lib/api";
import { mediaUrl } from "@/lib/media";

type LoadState = "loading" | "ready" | "error";
type MediaSize = "lead" | "rail" | "desk";

function fmt(iso?: string): string {
  if (!iso) return "";
  const time = Date.parse(iso);
  return Number.isNaN(time) ? "" : new Date(time).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function tagLabel(tag: string): string {
  return tag.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function readTime(article: NewsArticle): string {
  const words = article.body.trim().split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.ceil(words / 200))} min read`;
}

function published(article: NewsArticle): string {
  return fmt(article.publishedAt ?? article.createdAt);
}

function StoryMedia({ article, size }: Readonly<{ article: NewsArticle; size: MediaSize }>) {
  const height: Record<MediaSize, string> = {
    lead: "min-h-[20rem] sm:min-h-[28rem] lg:min-h-[34rem]",
    rail: "h-24 sm:h-28 lg:h-full lg:min-h-32",
    desk: "h-48 sm:h-56",
  };

  return (
    <div
      className={`on-dark-pin relative ${height[size]} w-full overflow-hidden`}
      style={{ backgroundColor: article.coverColor ?? "#123F2D" }}
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(199,162,74,0.42),transparent_38%),linear-gradient(145deg,rgba(14,124,107,0.2),rgba(12,44,31,0.92))]"
      />
      {!article.coverImageUrl && (
        <span aria-hidden className="absolute bottom-4 right-5 text-[0.62rem] font-bold uppercase tracking-[0.26em] text-cream/45">
          Oguaa newsroom
        </span>
      )}
      {article.coverImageUrl && (
        <img
          src={mediaUrl(article.coverImageUrl)}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.035]"
          onError={(event) => { event.currentTarget.style.display = "none"; }}
        />
      )}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-green-900/80 via-green-900/10 to-transparent" />
    </div>
  );
}

function StoryMeta({ article, light = false }: Readonly<{ article: NewsArticle; light?: boolean }>) {
  const date = published(article);
  return (
    <p className={`text-xs ${light ? "text-cream/68" : "text-ink-faint"}`}>
      {date && <>{date} <span aria-hidden>·</span>{" "}</>}{readTime(article)}
    </p>
  );
}

function StoryTag({ article, light = false, preferred }: Readonly<{ article: NewsArticle; light?: boolean; preferred?: string }>) {
  const tag = preferred && article.tags?.includes(preferred) ? preferred : article.tags?.[0] ?? "News";
  return (
    <span className={`inline-flex min-h-7 items-center rounded-full px-3 text-[0.62rem] font-bold uppercase tracking-[0.17em] ${light ? "border border-cream/20 bg-green-900/60 text-gold backdrop-blur-sm" : "bg-gold/[0.13] text-gold-text"}`}>
      {tagLabel(tag)}
    </span>
  );
}

function LeadStory({ article, activeTag }: Readonly<{ article: NewsArticle; activeTag: string }>) {
  return (
    <Link
      to={`/news/${article.slug}`}
      className="on-dark-pin group grid overflow-hidden rounded-[var(--radius-card)] bg-green-900 shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-lift)] lg:grid-cols-[minmax(0,1.24fr)_minmax(19rem,0.76fr)]"
    >
      <div className="relative">
        <StoryMedia article={article} size="lead" />
        <div className="absolute left-5 top-5"><StoryTag article={article} light preferred={activeTag} /></div>
        <span className="absolute bottom-5 left-5 inline-flex min-h-8 items-center rounded-full bg-cream px-3 text-[0.62rem] font-bold uppercase tracking-[0.17em] text-green-900 shadow-sm">
          Lead story
        </span>
      </div>

      <div className="on-dark flex flex-col justify-between border-t border-cream/10 p-6 text-cream sm:p-8 lg:border-l lg:border-t-0 lg:p-9">
        <div>
          <p className="text-[0.64rem] font-bold uppercase tracking-[0.19em] text-gold">Today’s front page</p>
          <h2 className="mt-4 text-3xl font-semibold leading-[1.06] text-cream transition-colors group-hover:text-gold sm:text-[2.65rem]">
            {article.title}
          </h2>
          {article.summary && <p className="mt-5 text-base leading-relaxed text-cream/76">{article.summary}</p>}
        </div>

        <div className="mt-8 border-t border-cream/15 pt-5">
          <p className="text-xs font-semibold text-cream/85">By {article.authorName}</p>
          <StoryMeta article={article} light />
          <span className="mt-5 flex min-h-11 items-center justify-between text-sm font-semibold text-gold">
            Read the full story
            <span className="grid h-9 w-9 place-items-center rounded-full border border-gold/35 bg-gold/10 transition-transform group-hover:translate-x-1" aria-hidden>→</span>
          </span>
        </div>
      </div>
    </Link>
  );
}

function BriefingRail({ articles, activeTag }: Readonly<{ articles: NewsArticle[]; activeTag: string }>) {
  return (
    <aside aria-labelledby="latest-briefings" className="overflow-hidden rounded-[var(--radius-card)] border border-green/12 bg-cream shadow-[var(--shadow-card)]">
      <div className="flex items-end justify-between gap-4 border-b border-sand px-5 py-5 sm:px-6">
        <div>
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.2em] text-gold-text">The latest</p>
          <h2 id="latest-briefings" className="mt-1 text-2xl font-semibold text-ink">From the desk</h2>
        </div>
        <span className="rounded-full bg-green px-2.5 py-1 text-xs font-bold text-cream">{articles.length}</span>
      </div>

      <ol className="divide-y divide-sand">
        {articles.map((article, index) => (
          <li key={article.id}>
            <Link
              to={`/news/${article.slug}`}
              className="group grid min-h-32 grid-cols-[6.75rem_1fr] gap-4 p-3 transition-colors hover:bg-paper sm:grid-cols-[8.5rem_1fr] lg:grid-cols-[7.5rem_1fr]"
            >
              <StoryMedia article={article} size="rail" />
              <div className="flex min-w-0 flex-col justify-center py-1 pr-2">
                <div className="flex items-center gap-2">
                  <span className="text-[0.62rem] font-bold tabular-nums text-gold-text">0{index + 1}</span>
                  <StoryTag article={article} preferred={activeTag} />
                </div>
                <h3 className="mt-2 line-clamp-3 text-base font-semibold leading-snug text-ink transition-colors group-hover:text-green">
                  {article.title}
                </h3>
                <div className="mt-2"><StoryMeta article={article} /></div>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </aside>
  );
}

function DeskStory({ article, index, activeTag }: Readonly<{ article: NewsArticle; index: number; activeTag: string }>) {
  const accents = ["green", "teal", "clay", "gold"];
  return (
    <Reveal delay={Math.min(index, 3) * 0.06} className="h-full">
      <Link
        to={`/news/${article.slug}`}
        className={`og-card og-card-interactive og-card-accent-${accents[index % accents.length]} group grid h-full grid-rows-[auto_1fr]`}
      >
        <StoryMedia article={article} size="desk" />
        <div className="flex flex-col p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <StoryTag article={article} preferred={activeTag} />
            <StoryMeta article={article} />
          </div>
          <h3 className="mt-4 text-2xl font-semibold leading-tight text-ink transition-colors group-hover:text-green">{article.title}</h3>
          {article.summary && <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-ink-muted">{article.summary}</p>}
          <div className="mt-auto flex min-h-11 items-center justify-between gap-4 border-t border-green/10 pt-5 text-sm">
            <span className="text-xs text-ink-faint">By {article.authorName}</span>
            <span className="font-semibold text-green">Read <span aria-hidden>→</span></span>
          </div>
        </div>
      </Link>
    </Reveal>
  );
}

function NewsroomSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="animate-pulse motion-reduce:animate-none">
      <span className="sr-only">Loading the latest stories</span>
      <div className="flex gap-3 overflow-hidden border-y border-sand py-5">
        {[8, 10, 7, 9, 8].map((width, index) => <div key={`${width}-${index}`} className="h-11 shrink-0 rounded-full bg-sand" style={{ width: `${width * 0.7}rem` }} />)}
      </div>
      <div className="mt-8 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(20rem,0.65fr)]">
        <div className="grid overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream lg:grid-cols-[1.2fr_0.8fr]">
          <div className="h-[20rem] bg-sand sm:h-[28rem] lg:h-[34rem]" />
          <div className="space-y-4 p-8">
            <div className="h-3 w-24 rounded bg-sand" />
            <div className="h-12 w-full rounded-lg bg-sand" />
            <div className="h-4 w-full rounded bg-sand" />
            <div className="h-4 w-3/4 rounded bg-sand" />
          </div>
        </div>
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream">
          <div className="h-20 border-b border-sand bg-sand/50" />
          {[0, 1, 2].map((item) => (
            <div key={item} className="grid h-32 grid-cols-[7.5rem_1fr] gap-4 border-b border-sand p-3 last:border-0">
              <div className="rounded-xl bg-sand" />
              <div className="space-y-3 py-2"><div className="h-3 w-20 rounded bg-sand" /><div className="h-4 w-full rounded bg-sand" /><div className="h-3 w-2/3 rounded bg-sand" /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyNewsroom({ error }: Readonly<{ error?: boolean }>) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-green/20 bg-cream px-6 py-16 text-center shadow-[var(--shadow-card)]">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-gold/[0.13] text-2xl text-gold-text" aria-hidden>◇</span>
      <h2 className="mt-5 text-2xl font-semibold text-ink">{error ? "The newsroom is briefly offline" : "The next edition is being prepared"}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-muted">
        {error ? "We could not reach the news service. Please try this page again in a moment." : "There are no published stories yet. Check back soon for notices and reporting from across Cape Coast."}
      </p>
    </div>
  );
}

function TopicRail({ tags, articles, active, onChange }: Readonly<{ tags: string[]; articles: NewsArticle[]; active: string; onChange: (tag: string) => void }>) {
  return (
    <fieldset aria-label="Filter news by topic" className="flex w-full min-w-0 max-w-full gap-2 overflow-x-auto border-y border-sand py-5">
      <button
        type="button"
        aria-pressed={active === "all"}
        onClick={() => onChange("all")}
        className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors ${active === "all" ? "border-green bg-green text-cream" : "border-sand bg-cream text-ink-muted hover:border-green/30 hover:text-green"}`}
      >
        All stories <span className={active === "all" ? "ml-1 text-cream/65" : "ml-1 text-ink-faint"}>{articles.length}</span>
      </button>
      {tags.map((tag) => {
        const count = articles.filter((article) => article.tags?.includes(tag)).length;
        const selected = active === tag;
        return (
          <button
            key={tag}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(tag)}
            className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors ${selected ? "border-green bg-green text-cream" : "border-sand bg-cream text-ink-muted hover:border-green/30 hover:text-green"}`}
          >
            {tagLabel(tag)} <span className={selected ? "ml-1 text-cream/65" : "ml-1 text-ink-faint"}>{count}</span>
          </button>
        );
      })}
    </fieldset>
  );
}

export function Component() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [activeTag, setActiveTag] = useState("all");

  useEffect(() => {
    let alive = true;
    api.news()
      .then((data) => {
        if (alive) {
          setArticles(data);
          setState("ready");
        }
      })
      .catch(() => {
        if (alive) setState("error");
      });
    return () => { alive = false; };
  }, []);

  const tags = useMemo(() => Array.from(new Set(articles.flatMap((article) => article.tags ?? []))).sort(), [articles]);
  const visible = activeTag === "all" ? articles : articles.filter((article) => article.tags?.includes(activeTag));
  const [lead, ...rest] = visible;
  const briefings = rest.slice(0, 3);
  const desk = rest.slice(3);

  return (
    <>
      <PageHero
        scene={CoastScene}
        kicker="News"
        title="The city, in its own words."
        lede="Reporting, notices and opportunities from the people and institutions shaping Cape Coast — open to everyone, without a paywall."
      >
        <div className="flex max-w-4xl flex-wrap gap-2">
          <a
            href="#front-page"
            className="group inline-flex min-h-11 items-center gap-2 rounded-full border border-cream/25 bg-green-900/35 px-4 text-sm text-cream backdrop-blur-sm transition-colors hover:border-gold hover:bg-gold hover:text-green-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            <span className="text-[0.62rem] font-semibold tracking-[0.15em] text-gold transition-colors group-hover:text-green-900/65" aria-hidden>
              01
            </span>
            <span className="font-semibold">Front page</span>
          </a>
          <a
            href="#latest"
            className="group inline-flex min-h-11 items-center gap-2 rounded-full border border-cream/25 bg-green-900/35 px-4 text-sm text-cream backdrop-blur-sm transition-colors hover:border-gold hover:bg-gold hover:text-green-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            <span className="text-[0.62rem] font-semibold tracking-[0.15em] text-gold transition-colors group-hover:text-green-900/65" aria-hidden>
              02
            </span>
            <span className="font-semibold">Latest</span>
          </a>
          <a
            href="#city-desk"
            className="group inline-flex min-h-11 items-center gap-2 rounded-full border border-cream/25 bg-green-900/35 px-4 text-sm text-cream backdrop-blur-sm transition-colors hover:border-gold hover:bg-gold hover:text-green-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            <span className="text-[0.62rem] font-semibold tracking-[0.15em] text-gold transition-colors group-hover:text-green-900/65" aria-hidden>
              03
            </span>
            <span className="font-semibold">City desk</span>
          </a>
        </div>
        {articles[0] && (
          <Link
            to={`/news/${articles[0].slug}`}
            className="mt-5 inline-flex max-w-md items-center gap-2 rounded-full border border-cream/25 bg-green-900/35 px-4 py-2 text-sm font-semibold text-cream backdrop-blur-sm transition-colors hover:border-gold hover:bg-gold hover:text-green-900"
          >
            New on the desk: {articles[0].title}
            <span aria-hidden>→</span>
          </Link>
        )}
      </PageHero>

      <section className="bg-paper py-12 text-ink sm:py-16 lg:py-20" aria-label="Newsroom stories">
        <Container size="wide">
          {state === "loading" && <NewsroomSkeleton />}
          {state === "error" && <EmptyNewsroom error />}
          {state === "ready" && articles.length === 0 && <EmptyNewsroom />}

          {state === "ready" && articles.length > 0 && (
            <>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3 text-[0.67rem] font-bold uppercase tracking-[0.17em] text-ink-faint">
                <span>Oguaa newsroom · Cape Coast</span>
                <span>{visible.length} of {articles.length} published {articles.length === 1 ? "story" : "stories"} · Always free</span>
              </div>

              <TopicRail tags={tags} articles={articles} active={activeTag} onChange={setActiveTag} />

              {lead && (
                <Reveal className="mt-8">
                  <section id="front-page" aria-label="Front page" className={`grid items-start gap-5 ${briefings.length > 0 ? "xl:grid-cols-[minmax(0,1.55fr)_minmax(20rem,0.65fr)]" : ""}`}>
                    <LeadStory article={lead} activeTag={activeTag} />
                    {briefings.length > 0 && (
                      <div id="latest">
                        <BriefingRail articles={briefings} activeTag={activeTag} />
                      </div>
                    )}
                  </section>
                </Reveal>
              )}

              {desk.length > 0 && (
                <section id="city-desk" className="mt-14 border-t border-green/15 pt-8 sm:mt-16">
                  <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <p className="text-[0.66rem] font-bold uppercase tracking-[0.21em] text-gold-text">Across Cape Coast</p>
                      <h2 className="mt-2 text-3xl font-semibold text-ink sm:text-4xl">The city desk</h2>
                    </div>
                    <p className="max-w-sm text-sm leading-relaxed text-ink-muted">More reporting, public notices and community opportunities.</p>
                  </div>
                  <div className="grid items-stretch gap-5 md:grid-cols-2 lg:grid-cols-3">
                    {desk.map((article, index) => <DeskStory key={article.id} article={article} index={index} activeTag={activeTag} />)}
                  </div>
                </section>
              )}
            </>
          )}
        </Container>
      </section>
    </>
  );
}
