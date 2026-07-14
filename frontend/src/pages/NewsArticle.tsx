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

export function Component() {
  const a = useLoaderData() as NewsArticle;
  return (
    <article>
      {a.coverImageUrl ? (
        <img src={cldCover(a.coverImageUrl, 1200)} alt="" className="h-64 w-full object-cover sm:h-96" />
      ) : (
        <div className="h-2 w-full" style={{ backgroundColor: a.coverColor ?? "#123F2D" }} />
      )}
      <Container size="prose" className="py-12">
        <Link to="/news" className="text-sm font-medium text-teal-text hover:underline">← Newsroom</Link>
        <h1 className="mt-4 font-display text-4xl font-semibold leading-tight text-ink sm:text-5xl">{a.title}</h1>
        {a.summary && <p className="mt-4 font-serif text-xl italic text-ink-muted">{a.summary}</p>}
        <p className="mt-4 border-b border-sand pb-6 text-sm text-ink-faint">
          By {a.authorName} · {formatDate(a.publishedAt ?? a.createdAt)}
        </p>
        <div className="mt-6">
          <Markdown>{a.body}</Markdown>
        </div>
        {a.tags && a.tags.length > 0 && (
          <div className="mt-10 flex flex-wrap gap-2 border-t border-sand pt-6">
            {a.tags.map((t) => (
              <span key={t} className="rounded-full border border-sand bg-cream px-3 py-1 text-xs text-ink-muted">#{t}</span>
            ))}
          </div>
        )}
      </Container>
    </article>
  );
}
