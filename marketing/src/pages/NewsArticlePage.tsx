import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Container } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { Reveal } from "@/components/motion";
import { AiChip } from "@/components/ai-chip";
import { EDITORIAL_URL } from "@/config";
import { api, type NewsArticle, type NewsCorrection, type NewsSource } from "@/lib/api";
import { mediaUrl } from "@/lib/media";
import { setPageMeta } from "@/lib/meta";
import {
  AI_COVER_CAPTION,
  coverAlt,
  isAiCover,
  isReport,
  linkCitations,
  newsDate,
  reportByline,
  safeHttps,
  sourceAnchor,
} from "@/lib/news";

const META_DESCRIPTION_MAX = 200;

/** A share/search description from the summary: plain text, one line, capped. */
function metaDescription(a: NewsArticle): string {
  const plain = (a.summary ?? "")
    .replace(/[#*_>`[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return `${a.title} — news from Cape Coast (Oguaa), Ghana.`;
  return plain.length > META_DESCRIPTION_MAX ? `${plain.slice(0, META_DESCRIPTION_MAX - 1).trimEnd()}…` : plain;
}

function ArticleSkeleton() {
  return (
    <div className="min-h-screen bg-paper" role="status" aria-busy="true">
      <span className="sr-only">Loading the story</span>
      <div className="h-64 w-full animate-pulse bg-sand motion-reduce:animate-none sm:h-96" />
      <Container size="prose" className="relative z-10 -mt-16 pb-16">
        <div className="rounded-[var(--radius-card)] border border-sand bg-cream p-7 shadow-[var(--shadow-lift)] sm:p-10">
          <div className="h-8 w-24 animate-pulse rounded-full bg-sand motion-reduce:animate-none" />
          <div className="mt-5 h-10 w-3/4 animate-pulse rounded-md bg-sand motion-reduce:animate-none" />
          <div className="mt-4 h-5 w-1/2 animate-pulse rounded-md bg-sand motion-reduce:animate-none" />
        </div>
        <div className="mt-10 space-y-3">
          {[100, 96, 88, 92, 64].map((w) => (
            <div key={w} className="h-4 animate-pulse rounded bg-sand motion-reduce:animate-none" style={{ width: `${w}%` }} />
          ))}
        </div>
      </Container>
    </div>
  );
}

function ArticleCover({ a }: Readonly<{ a: NewsArticle }>) {
  if (a.coverImageUrl) {
    return (
      <div className="relative h-64 w-full overflow-hidden bg-green-900 pt-16 sm:h-96">
        <img
          src={mediaUrl(a.coverImageUrl)}
          alt={coverAlt(a)}
          className="h-full w-full object-cover"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
        <div aria-hidden className="absolute inset-0 top-16 bg-gradient-to-t from-green-900/80 via-green-900/20 to-transparent" />
      </div>
    );
  }
  return (
    <div className="on-dark-pin relative h-40 w-full overflow-hidden bg-green pt-16 sm:h-56" style={a.coverColor ? { backgroundColor: a.coverColor } : undefined}>
      <div aria-hidden className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gold-brand/20 blur-3xl" />
    </div>
  );
}

/** The byline: reports name the desk, the AI assistance and the reviewing editor. */
function Byline({ a }: Readonly<{ a: NewsArticle }>) {
  const date = newsDate(a.publishedAt ?? a.createdAt);
  if (isReport(a)) {
    return (
      <p className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-sand pt-5 text-sm text-ink-muted">
        <span className="font-semibold text-ink">{reportByline(a)}</span>
        {date && (
          <span className="inline-flex items-center gap-2 whitespace-nowrap">
            <span aria-hidden className="text-ink-faint">·</span>
            <time dateTime={a.publishedAt ?? a.createdAt} className="tabular-nums text-ink-faint">{date}</time>
          </span>
        )}
      </p>
    );
  }
  return (
    <p className="mt-6 border-t border-sand pt-5 text-sm text-ink-faint">
      By {a.authorName}
      {a.sourceAuthor && a.sourceName && <> · Original reporting by {a.sourceAuthor} for {a.sourceName}</>}
      {date && <> · <time dateTime={a.publishedAt ?? a.createdAt} className="tabular-nums">{date}</time></>}
    </p>
  );
}

/** How the story was made. AI-assisted reports get the AI (purple) treatment; feed briefs stay gold. */
function AutomationNote({ a }: Readonly<{ a: NewsArticle }>) {
  if (isReport(a)) {
    const count = a.sources?.length ?? 0;
    return (
      <aside aria-label="How this report was made" className="mt-6 rounded-xl border border-ai-line bg-ai-tint p-5 sm:p-6">
        <AiChip>AI-assisted report</AiChip>
        {a.automationLabel && <p className="mt-3 max-w-[62ch] text-sm leading-relaxed text-pretty text-ink">{a.automationLabel}</p>}
        <p className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
          {count > 0 && (
            <a href="#sources" className="text-ai underline decoration-ai/35 underline-offset-4 transition-colors hover:decoration-ai">
              See the {count} {count === 1 ? "source" : "sources"}
            </a>
          )}
          <a href={EDITORIAL_URL} target="_blank" rel="noopener noreferrer" className="text-ai underline decoration-ai/35 underline-offset-4 transition-colors hover:decoration-ai">
            How Oguaa uses AI <span aria-hidden>↗</span>
          </a>
        </p>
      </aside>
    );
  }

  if (!a.automated) return null;
  const original = safeHttps(a.sourceUrl);
  return (
    <aside aria-label="About this story" className="mt-6 rounded-xl border border-gold-border/35 bg-gold/[0.07] p-5 text-sm leading-relaxed text-ink-muted sm:p-6">
      <p className="font-semibold text-ink">{a.automationLabel || "Automated report"}</p>
      <p className="mt-1.5 max-w-[62ch] text-pretty">
        This summary was assembled from a public source.
        {a.sourceAuthor && <> Original story by {a.sourceAuthor}.</>}
      </p>
      {original && (
        <a href={original} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-1.5 font-semibold text-green-text underline decoration-green-text/30 underline-offset-4 transition-colors hover:decoration-green-text">
          Read the original at {a.sourceName || "the source"} <span aria-hidden>↗</span>
        </a>
      )}
    </aside>
  );
}

/** Dated public corrections, above the body: never silent edits. */
function Corrections({ items }: Readonly<{ items: readonly NewsCorrection[] }>) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="corrections-title" className="mt-6 rounded-xl border border-clay/25 bg-clay/[0.05] p-5 sm:p-6">
      <h2 id="corrections-title" className="text-xs font-semibold uppercase tracking-[0.18em] text-clay-text">
        {items.length === 1 ? "Correction" : "Corrections"}
      </h2>
      <ol className="mt-3 space-y-3">
        {items.map((c, i) => (
          <li key={`${c.at}-${i}`} className="grid gap-1 text-sm sm:grid-cols-[6.5rem_1fr] sm:gap-4">
            <time dateTime={c.at} className="font-medium tabular-nums text-ink-faint">{newsDate(c.at)}</time>
            <p className="max-w-[62ch] leading-relaxed text-pretty text-ink">{c.note}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Numbered sources, styled as footnotes: quiet, readable, each linked where the link is https. */
function Sources({ items }: Readonly<{ items: readonly NewsSource[] }>) {
  if (items.length === 0) return null;
  return (
    <section id="sources" aria-labelledby="sources-title" className="mt-14 scroll-mt-28 border-t border-sand pt-6">
      <h2 id="sources-title" className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-faint">
        Sources
      </h2>
      <ol className="mt-4 divide-y divide-sand/80">
        {items.map((s, i) => {
          const n = i + 1;
          const href = safeHttps(s.url);
          const title = s.title?.trim() || s.url;
          return (
            <li
              key={`${n}-${s.url}`}
              id={sourceAnchor(n)}
              className="grid scroll-mt-28 grid-cols-[2rem_1fr] gap-2 py-3 text-sm transition-colors duration-300 target:bg-gold/[0.09]"
            >
              <span className="pt-px font-semibold tabular-nums text-gold-text">{n}.</span>
              <div className="min-w-0 leading-relaxed text-ink-muted">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold text-ink">{s.name}</span>
                  {s.original && (
                    <span className="rounded-[0.2rem] border border-gold-border/45 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase leading-none tracking-[0.12em] text-gold-text">
                      Original report
                    </span>
                  )}
                </p>
                <p className="mt-0.5 break-words">
                  {href ? (
                    <a href={href} target="_blank" rel="noopener" className="text-ink-muted underline decoration-ink-faint/40 underline-offset-[3px] transition-colors hover:text-ink hover:decoration-ink-muted">
                      {title}
                    </a>
                  ) : (
                    title
                  )}
                  {s.author && <span className="text-ink-faint"> · {s.author}</span>}
                  {s.publishedAt && newsDate(s.publishedAt) && (
                    <span className="tabular-nums text-ink-faint"> · {newsDate(s.publishedAt)}</span>
                  )}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
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

  // Each article shares and indexes as itself, not as the Newsroom default
  // RootLayout applies (there is no route handle for news/:slug).
  useEffect(() => {
    if (state !== "ready" || !article) return;
    setPageMeta({
      title: `${article.title} — Oguaa Newsroom`,
      description: metaDescription(article),
      image: article.coverImageUrl,
    });
  }, [article, state]);

  if (state === "loading") return <ArticleSkeleton />;

  if (state === "missing" || !article) {
    return (
      <div className="min-h-screen bg-paper">
        <Container size="narrow" className="flex min-h-screen flex-col items-center justify-center pt-20 text-center">
          <h1 className="text-3xl font-semibold text-ink">We couldn't find that story</h1>
          <p className="mt-3 max-w-md text-pretty text-ink-muted">It may have moved or been taken down. The newsroom has everything that's currently published.</p>
          <Link to="/news" className="mt-6 inline-flex min-h-11 items-center rounded-full bg-green px-5 text-sm font-semibold text-cream on-dark-pin transition-[background-color,transform] duration-200 hover:bg-green-900 active:translate-y-px">
            ← Back to the newsroom
          </Link>
        </Container>
      </div>
    );
  }

  const tags = article.tags ?? [];
  const sources = article.sources ?? [];
  const aiCover = isAiCover(article);
  const body = isReport(article) ? linkCitations(article.body, sources) : article.body;

  return (
    <article className="min-h-screen bg-paper">
      <figure className="m-0">
        <ArticleCover a={article} />
        {aiCover && (
          <figcaption className="bg-paper">
            <Container size="prose" className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3.5">
              <AiChip>AI illustration</AiChip>
              <span className="text-xs leading-relaxed text-pretty text-ink-muted">{AI_COVER_CAPTION}</span>
            </Container>
          </figcaption>
        )}
      </figure>
      <Container size="prose" className={`relative z-10 pb-16 ${aiCover ? "mt-2" : "-mt-16"}`}>
        <Reveal>
          <div className="rounded-[var(--radius-card)] border border-sand bg-cream p-7 shadow-[var(--shadow-lift)] sm:p-10">
            <Link to="/news" className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-sand bg-paper px-3.5 py-1.5 text-sm font-medium text-teal-text transition-[color,background-color,border-color,transform] duration-200 hover:border-teal hover:bg-teal/[0.06] active:translate-y-px">
              ← Newsroom
            </Link>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-[-0.02em] text-ink sm:text-5xl">{article.title}</h1>
            {article.summary && <p className="mt-4 max-w-[60ch] text-lg leading-relaxed text-pretty text-ink-muted sm:text-xl">{article.summary}</p>}
            <Byline a={article} />
          </div>
        </Reveal>

        <AutomationNote a={article} />
        <Corrections items={article.corrections ?? []} />

        <div className="mt-10"><Markdown citations={isReport(article)} allowImages={false}>{body}</Markdown></div>

        <Sources items={sources} />

        {tags.length > 0 && (
          <div className="mt-10 flex flex-wrap gap-2 border-t border-sand pt-6">
            {tags.map((t) => (
              <span key={t} className="rounded-full bg-green/[0.07] px-3 py-1 text-xs font-medium text-green-text">#{t}</span>
            ))}
          </div>
        )}
      </Container>
    </article>
  );
}
