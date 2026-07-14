import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router-dom";
import type { NewsArticle } from "@/lib/types";
import { api } from "@/lib/api";
import { Container } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { formatDate } from "@/lib/format";
import { cldCover } from "@/lib/cloudinary";

export async function loader({ params }: LoaderFunctionArgs) {
  return api.newsArticle(params.slug!);
}

function ArticleCover({ a }: Readonly<{ a: NewsArticle }>) {
  if (a.coverImageUrl) {
    return (
      <div className="relative h-64 w-full overflow-hidden sm:h-96">
        <img src={cldCover(a.coverImageUrl, 1200)} alt="" className="h-full w-full object-cover" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-green-900/80 via-green-900/20 to-transparent" />
      </div>
    );
  }
  return (
    <div className="relative h-40 w-full overflow-hidden sm:h-56" style={{ backgroundColor: a.coverColor ?? "#123F2D" }}>
      <div aria-hidden className="bg-dotgrid absolute inset-0 opacity-40" />
      <div aria-hidden className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gold-brand/20 blur-3xl" />
    </div>
  );
}

export function Component() {
  const a = useLoaderData() as NewsArticle;
  const tags = a.tags ?? [];
  return (
    <article>
      <ArticleCover a={a} />
      <Container size="prose" className="relative z-10 -mt-16 pb-12">
        <div className="rounded-[var(--radius-card)] border border-sand bg-cream p-7 shadow-[var(--shadow-lift)] sm:p-10">
          <Link to="/news" className="inline-flex items-center gap-1.5 rounded-full border border-sand bg-paper px-3.5 py-1.5 text-sm font-medium text-teal-text transition-colors hover:border-teal hover:bg-teal/[0.06]">
            ← Newsroom
          </Link>
          <h1 className="mt-5 font-display text-4xl font-semibold leading-tight text-ink sm:text-5xl">{a.title}</h1>
          {a.summary && <p className="mt-4 font-serif text-xl italic text-ink-muted">{a.summary}</p>}
          <p className="mt-6 border-t border-sand pt-5 text-sm text-ink-faint">
            By {a.authorName} · {formatDate(a.publishedAt ?? a.createdAt)}
          </p>
        </div>

        <div className="mt-10">
          <Markdown>{a.body}</Markdown>
        </div>

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
