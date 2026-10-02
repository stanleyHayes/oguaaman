import { useState } from "react";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router-dom";
import { Markdown } from "@/components/markdown";
import { Skeleton, SkeletonText } from "@/components/skeleton";
import { Container, VerifiedBadge } from "@/components/ui";
import { api } from "@/lib/api";
import { cldCover } from "@/lib/cloudinary";
import { formatDate, newsCoverAlt } from "@/lib/format";
import type { NewsArticle } from "@/lib/types";
import { usePageTitle } from "@/lib/use-page-title";
import { ReportButton } from "@/components/report-button";
import { SubjectLink } from "@/components/subject-link";
import { AdSlot } from "@/components/ad-slot";
import { AIChip } from "@/components/ai-chip";
import { LEGAL } from "@/lib/legal";
import { useMediaQuery } from "@/lib/use-media-query";

export async function loader({ params }: LoaderFunctionArgs) {
  return api.newsArticle(params.slug!);
}

export function HydrateFallback() {
  return (
    <div className="bg-paper">
      <div className="on-dark on-dark-pin bg-green-900 py-12 sm:py-16">
        <Container size="wide" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_0.72fr] lg:items-end">
          <div>
            <Skeleton className="h-5 w-32 bg-cream/15" />
            <Skeleton className="mt-8 h-12 w-full max-w-2xl bg-cream/15" />
            <Skeleton className="mt-3 h-12 w-4/5 max-w-xl bg-cream/15" />
            <SkeletonText lines={2} className="mt-6 max-w-xl [&>span]:bg-cream/15" />
          </div>
          <Skeleton className="aspect-[4/3] w-full bg-cream/15" />
        </Container>
      </div>
      <Container size="wide" className="grid gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <SkeletonText lines={8} className="max-w-2xl" />
        <Skeleton className="h-60 w-full" />
      </Container>
    </div>
  );
}

/** The exact hero caption for AI covers (spec §2.8). */
const AI_COVER_CAPTION = "AI illustration generated with OpenAI for Oguaa. It does not show the real people, place or event.";

function StoryArtwork({ article }: Readonly<{ article: NewsArticle }>) {
  if (article.coverImageUrl) {
    const ai = article.coverImageKind === "ai";
    // Branded covers and AI illustrations share one 3:2 frame; uploaded
    // photos keep the taller editorial crop.
    const framed = ai || article.coverImageKind === "branded";
    const frame = framed ? "aspect-[3/2]" : "aspect-[4/3] min-h-72 lg:min-h-[26rem]";
    return (
      <figure className="w-full">
        <div className={`relative ${frame} w-full overflow-hidden rounded-[var(--radius-card)] border border-cream/15 bg-green-900 shadow-2xl`}>
          <img
            src={cldCover(article.coverImageUrl, 1200)}
            alt={newsCoverAlt(article)}
            className="h-full w-full object-cover"
          />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-green-900/45 via-transparent to-transparent" />
          {ai ? (
            <AIChip className="absolute bottom-4 left-4 shadow-sm">AI illustration</AIChip>
          ) : (
            <span className="absolute bottom-4 left-4 rounded-full border border-cream/25 bg-green-900/65 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-cream backdrop-blur-md">
              Oguaa newsroom
            </span>
          )}
        </div>
        {ai && (
          <figcaption className="mt-3 max-w-md text-pretty text-xs leading-relaxed text-cream/70">
            {AI_COVER_CAPTION}
            {article.coverImageCredit && <span className="mt-1 block text-cream/70">{article.coverImageCredit}</span>}
          </figcaption>
        )}
      </figure>
    );
  }

  return (
    <div
      className="relative aspect-[4/3] w-full min-h-72 overflow-hidden rounded-[var(--radius-card)] border border-cream/15 shadow-2xl lg:min-h-[26rem]"
      style={{ backgroundColor: article.coverColor ?? "#123F2D" }}
    >
      <div aria-hidden className="bg-dotgrid absolute inset-0 opacity-70" />
      <div aria-hidden className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-gold-brand/25 blur-3xl" />
      <div aria-hidden className="absolute -bottom-24 left-8 h-72 w-72 rounded-full bg-teal/20 blur-3xl" />
      <div className="absolute inset-x-8 bottom-8 border-l-2 border-gold pl-5 text-cream">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold">From the community</p>
        <p className="mt-2 max-w-xs text-sm text-cream/75">Reporting the people, places and moments shaping Cape Coast.</p>
      </div>
    </div>
  );
}

/** Only real web addresses become links; anything else stays plain text. */
function safeHttps(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}

/** Turn the report's [n] markers into links to the numbered sources below. */
function linkCitations(body: string, count: number): string {
  if (count === 0) return body;
  return body.replace(/\[(\d{1,2})\](?![(:])/g, (whole, n: string) => {
    const i = Number(n);
    return i >= 1 && i <= count ? `[\\[${i}\\]](#source-${i})` : whole;
  });
}

/** Footnote-style list of a report's sources (publisher, title, author). */
function Sources({ sources }: Readonly<{ sources: NonNullable<NewsArticle["sources"]> }>) {
  return (
    <section aria-labelledby="sources-heading" className="mt-12 max-w-[44rem] border-t border-sand pt-6">
      <h2 id="sources-heading" className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-ink-faint">Sources</h2>
      <ol className="mt-4 space-y-3 text-sm leading-relaxed text-ink-muted">
        {sources.map((src, i) => {
          const href = safeHttps(src.url);
          const title = src.title || src.url;
          return (
            <li key={`${src.url}-${src.name}`} id={`source-${i + 1}`} className="grid scroll-mt-28 grid-cols-[1.75rem_minmax(0,1fr)] gap-x-2 target:rounded-md target:bg-gold/[0.1]">
              <span className="pt-px text-right tabular-nums text-ink-faint">{i + 1}.</span>
              <span className="min-w-0">
                <span className="font-semibold text-ink">{src.name}</span>
                {", "}
                {href ? (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="break-words text-teal-text underline decoration-teal-text/30 underline-offset-2 hover:decoration-teal-text">
                    {title}
                  </a>
                ) : (
                  <span className="break-words">{title}</span>
                )}
                {src.author && <span>, by {src.author}</span>}
                {src.original && (
                  <span className="ml-2 inline-block rounded-sm border border-gold-border/40 px-1.5 py-px align-[1px] text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-gold-text">
                    Original report
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Dated corrections, shown above the body: never silent edits. */
function Corrections({ items }: Readonly<{ items: NonNullable<NewsArticle["corrections"]> }>) {
  return (
    <section aria-labelledby="corrections-heading" className="mb-8 max-w-[44rem] rounded-xl border border-clay/25 bg-clay/[0.05] px-5 py-4">
      <h2 id="corrections-heading" className="text-sm font-semibold text-ink">
        {items.length === 1 ? "Correction" : "Corrections"}
      </h2>
      <ul className="mt-2 space-y-2 text-sm leading-relaxed text-ink-muted">
        {items.map((c) => (
          <li key={`${c.at}-${c.note}`}>
            <time dateTime={c.at} className="font-medium tabular-nums text-ink">{formatDate(c.at)}</time>
            <span aria-hidden> · </span>
            {c.note}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ShareStory({ title }: Readonly<{ title: string }>) {
  const [status, setStatus] = useState<"idle" | "done">("idle");

  async function share() {
    const data = { title, text: title, url: window.location.href };
    try {
      if (navigator.share) {
        await navigator.share(data);
      } else {
        await navigator.clipboard.writeText(window.location.href);
      }
      setStatus("done");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full border border-green/25 px-4 text-sm font-semibold text-green-text transition-colors hover:border-green hover:bg-green/[0.06]"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
        <path d="m8.7 10.7 6.6-4.3M8.7 13.3l6.6 4.3" />
      </svg>
      {status === "done" ? "Link ready to share" : "Share this story"}
    </button>
  );
}

function StoryMeta({ article }: Readonly<{ article: NewsArticle }>) {
  const published = article.publishedAt ?? article.createdAt;
  const wasUpdated = article.updatedAt.slice(0, 10) !== published.slice(0, 10);
  const tags = article.tags ?? [];

  return (
    <aside aria-label="Article information">
      <div className="rounded-[var(--radius-card)] border border-sand bg-cream p-5 shadow-[var(--shadow-card)]">
        <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-gold-text">Story details</p>
        <dl className="mt-4 divide-y divide-sand border-y border-sand text-sm">
          <div className="py-4">
            <dt className="text-xs text-ink-faint">Filed by</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2 font-semibold text-ink">
              {byline(article)}
              {article.automated && article.tier !== "report" && <span className="rounded-full border border-gold/40 bg-gold/[0.1] px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-gold-text">Automated</span>}
              {article.authorVerified && <VerifiedBadge iconOnly verifiedAs={article.authorVerifiedAs} />}
            </dd>
          </div>
          <div className="py-4">
            <dt className="text-xs text-ink-faint">Published</dt>
            <dd className="mt-1 font-medium text-ink">{formatDate(published)}</dd>
          </div>
          {wasUpdated && (
            <div className="py-4">
              <dt className="text-xs text-ink-faint">Last updated</dt>
              <dd className="mt-1 font-medium text-ink">{formatDate(article.updatedAt)}</dd>
            </div>
          )}
        </dl>

        {article.tier === "report" && (
          <div className="mt-5 rounded-xl border border-ai-line bg-ai-tint p-3 text-xs leading-relaxed text-ink-muted">
            <p className="mb-1.5"><AIChip>AI-assisted</AIChip></p>
            <p className="text-pretty">{article.automationLabel ?? "AI-assisted report, reviewed by an Oguaa editor before publication."}</p>
            <Link to={LEGAL.editorial} className="mt-2 inline-block font-semibold text-teal-text underline-offset-2 hover:underline">
              How Oguaa uses AI
            </Link>
          </div>
        )}

        {article.tier !== "report" && article.sourceUrl?.startsWith("https://") && (
          <div className="mt-5 rounded-xl border border-gold/30 bg-gold/[0.07] p-3 text-xs leading-relaxed text-ink-muted">
            {article.automated && <strong className="block text-ink">{article.automationLabel ?? "Automated report"}</strong>}
            {article.automated && "This summary was assembled from a public source. "}
            {article.sourceAuthor && <>Original story by {article.sourceAuthor}. </>}
            <a className="font-semibold text-green-text underline" href={article.sourceUrl} target="_blank" rel="noreferrer">
              Read the original at {article.sourceName ?? "the source"} <span aria-hidden>↗</span>
            </a>
          </div>
        )}

        {tags.length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-semibold text-ink-muted">Filed under</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span key={tag} className="rounded-full border border-green/15 bg-green/[0.06] px-2.5 py-1 text-xs font-medium text-green-text">
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-col items-start gap-2 border-t border-sand pt-5">
          <ReportButton target={{ type: "news", id: article.id }} />
          <SubjectLink />
        </div>

        <div className="mt-5 border-t border-sand pt-5">
          <ShareStory title={article.title} />
          <Link to="/news" className="mt-3 inline-flex min-h-10 w-full items-center justify-center text-sm font-semibold text-teal-text hover:underline">
            More from the newsroom →
          </Link>
        </div>
      </div>
    </aside>
  );
}

/** "Oguaa Desk · AI-assisted · Reviewed by …" for reports; the author otherwise. */
function byline(article: NewsArticle): string {
  if (article.tier === "report") {
    return article.reviewedByName ? `Oguaa Desk · AI-assisted · Reviewed by ${article.reviewedByName}` : "Oguaa Desk · AI-assisted";
  }
  return article.authorName;
}

export function Component() {
  const article = useLoaderData() as NewsArticle;
  usePageTitle(article.title);
  const wide = useMediaQuery("(min-width: 1024px)");
  const tags = article.tags ?? [];
  const sources = article.sources ?? [];
  const corrections = article.corrections ?? [];
  const report = article.tier === "report";
  const name = byline(article);
  // Election coverage never carries political ads beside it.
  const ad = <AdSlot placement="portal-article-rect" section="news" political={Boolean(article.political) || tags.includes("Election coverage")} />;

  return (
    <article className="bg-paper">
      <header className="on-dark on-dark-pin relative overflow-hidden bg-green-900 text-cream">
        <div aria-hidden className="bg-dotgrid absolute inset-0 opacity-35" />
        <div aria-hidden className="absolute -left-32 top-1/2 h-80 w-80 -translate-y-1/2 rounded-full bg-teal/10 blur-3xl" />
        <Container size="wide" className="relative grid gap-10 py-10 sm:py-14 lg:grid-cols-[minmax(0,1.05fr)_0.78fr] lg:items-center lg:py-16">
          <div>
            <Link to="/news" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-cream/20 bg-cream/[0.06] px-4 text-sm font-semibold text-cream transition-colors hover:border-gold/60 hover:bg-cream/10">
              <span aria-hidden>←</span> News &amp; notices
            </Link>
            <p className="mt-8 text-[0.68rem] font-bold uppercase tracking-[0.24em] text-gold">{report ? "Oguaa Desk report" : "Latest from Oguaa"}</p>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-[1.04] tracking-[-0.02em] text-cream sm:text-5xl lg:text-6xl">{article.title}</h1>
            {article.summary && <p className="mt-6 max-w-2xl text-pretty border-l-2 border-gold pl-5 text-lg leading-relaxed text-cream/78 sm:text-xl">{article.summary}</p>}
            <div className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-cream/70">
              <span className="grid h-9 w-9 place-items-center rounded-full border border-gold/35 bg-gold/15 font-bold text-gold" aria-hidden>
                {name.trim().charAt(0).toUpperCase()}
              </span>
              <span className="font-semibold text-cream">{name}</span>
              {article.automated && !report && <span className="rounded-full border border-gold/45 bg-gold/15 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-gold">Automated</span>}
              {article.authorVerified && !report && <VerifiedBadge iconOnly onDark verifiedAs={article.authorVerifiedAs} />}
              <span aria-hidden className="text-gold/60">•</span>
              <time dateTime={article.publishedAt ?? article.createdAt}>{formatDate(article.publishedAt ?? article.createdAt)}</time>
            </div>
          </div>
          <StoryArtwork article={article} />
        </Container>
      </header>

      <Container size="wide" className="grid gap-8 py-10 sm:py-14 lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-12">
        <div className="min-w-0">
          <div className="mb-8 flex items-center gap-3 text-[0.68rem] font-bold uppercase tracking-[0.2em] text-gold-text" aria-hidden>
            <span className="h-px w-10 bg-gold-brand" /> The story
          </div>
          {corrections.length > 0 && <Corrections items={corrections} />}
          <div className="news-cites max-w-[44rem] text-[1.05rem] leading-8 sm:text-[1.1rem]">
            <Markdown allowImages={false}>{linkCitations(article.body, sources.length)}</Markdown>
          </div>
          {sources.length > 0 && <Sources sources={sources} />}
          {/* Below the sources on narrow screens; never inside the body. */}
          {!wide && <div className="mt-10 max-w-[44rem]">{ad}</div>}
          <footer className="mt-12 max-w-[44rem] border-t border-sand pt-6">
            <p className="text-sm leading-relaxed text-ink-muted">
              Oguaa Newsroom brings together community updates, verified notices and stories from across Cape Coast.
            </p>
          </footer>
        </div>
        {/* The details card scrolls away with the page; only the ad stays in
            view, clear of the header, for the rest of the read. */}
        <div className="space-y-6">
          <StoryMeta article={article} />
          {wide && <div className="lg:sticky lg:top-28">{ad}</div>}
        </div>
      </Container>
    </article>
  );
}
