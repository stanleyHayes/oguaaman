import { useState } from "react";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router-dom";
import { Markdown } from "@/components/markdown";
import { Skeleton, SkeletonText } from "@/components/skeleton";
import { Container, VerifiedBadge } from "@/components/ui";
import { api } from "@/lib/api";
import { cldCover } from "@/lib/cloudinary";
import { formatDate } from "@/lib/format";
import type { NewsArticle } from "@/lib/types";
import { usePageTitle } from "@/lib/use-page-title";

export async function loader({ params }: LoaderFunctionArgs) {
  return api.newsArticle(params.slug!);
}

export function HydrateFallback() {
  return (
    <div className="bg-paper">
      <div className="bg-green-900 py-12 sm:py-16">
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

function StoryArtwork({ article }: Readonly<{ article: NewsArticle }>) {
  if (article.coverImageUrl) {
    return (
      <div className="relative aspect-[4/3] min-h-72 overflow-hidden rounded-[var(--radius-card)] border border-cream/15 shadow-2xl lg:min-h-[26rem]">
        <img
          src={cldCover(article.coverImageUrl, 1200)}
          alt=""
          className="h-full w-full object-cover"
        />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-green-900/45 via-transparent to-transparent" />
        <span className="absolute bottom-4 left-4 rounded-full border border-cream/25 bg-green-900/65 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-cream backdrop-blur-md">
          Oguaa newsroom
        </span>
      </div>
    );
  }

  return (
    <div
      className="relative aspect-[4/3] min-h-72 overflow-hidden rounded-[var(--radius-card)] border border-cream/15 shadow-2xl lg:min-h-[26rem]"
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
    <aside aria-label="Article information" className="self-start lg:sticky lg:top-24">
      <div className="rounded-[var(--radius-card)] border border-sand bg-cream p-5 shadow-[var(--shadow-card)]">
        <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-gold-text">Story details</p>
        <dl className="mt-4 divide-y divide-sand border-y border-sand text-sm">
          <div className="py-4">
            <dt className="text-xs text-ink-faint">Filed by</dt>
            <dd className="mt-1 flex items-center gap-2 font-semibold text-ink">
              {article.authorName}
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

export function Component() {
  const article = useLoaderData() as NewsArticle;
  usePageTitle(article.title);

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
            <p className="mt-8 text-[0.68rem] font-bold uppercase tracking-[0.24em] text-gold">Latest from Oguaa</p>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-[1.04] text-cream sm:text-5xl lg:text-6xl">{article.title}</h1>
            {article.summary && <p className="mt-6 max-w-2xl border-l-2 border-gold pl-5 text-lg leading-relaxed text-cream/78 sm:text-xl">{article.summary}</p>}
            <div className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-cream/70">
              <span className="grid h-9 w-9 place-items-center rounded-full border border-gold/35 bg-gold/15 font-bold text-gold" aria-hidden>
                {article.authorName.trim().charAt(0).toUpperCase()}
              </span>
              <span className="font-semibold text-cream">{article.authorName}</span>
              {article.authorVerified && <VerifiedBadge iconOnly onDark verifiedAs={article.authorVerifiedAs} />}
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
          <div className="max-w-[44rem] text-[1.05rem] leading-8 sm:text-[1.1rem]">
            <Markdown>{article.body}</Markdown>
          </div>
          <footer className="mt-12 max-w-[44rem] border-t border-sand pt-6">
            <p className="text-sm leading-relaxed text-ink-muted">
              Oguaa Newsroom brings together community updates, verified notices and stories from across Cape Coast.
            </p>
          </footer>
        </div>
        <StoryMeta article={article} />
      </Container>
    </article>
  );
}
