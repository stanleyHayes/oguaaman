import { Link, useLoaderData } from "react-router-dom";
import type { NewsArticle } from "@/lib/types";
import { api } from "@/lib/api";
import { Container, CTA } from "@/components/ui";
import { EmptyState } from "@/components/empty-state";
import { formatDate } from "@/lib/format";
import { cldCover } from "@/lib/cloudinary";

export async function loader() {
  return api.news();
}

export function Component() {
  const articles = useLoaderData() as NewsArticle[];
  const [lead, ...rest] = articles;

  return (
    <>
      <section className="on-dark bg-green-900 py-14 text-cream">
        <Container>
          <p className="eyebrow text-gold/80">The Oguaa Newsroom</p>
          <h1 className="mt-2 font-display text-4xl font-semibold sm:text-5xl">News &amp; notices</h1>
          <p className="mt-3 max-w-2xl text-cream/80">Festivals, scholarships, homecomings and announcements — from the community and its institutions.</p>
        </Container>
      </section>

      <Container className="py-12">
        {articles.length === 0 ? (
          <EmptyState
            title="No news yet"
            description="When the community and its institutions post, the latest from Oguaa will appear here."
            actions={<CTA to="/" variant="outline">Back to home</CTA>}
          />
        ) : (
          <>
            {lead && (
              <Link to={`/news/${lead.slug}`} className="group block overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)]">
                {lead.coverImageUrl ? (
                  <img src={cldCover(lead.coverImageUrl, 1000)} alt="" loading="lazy" className="h-56 w-full object-cover sm:h-72" />
                ) : (
                  <div className="h-3 w-full" style={{ backgroundColor: lead.coverColor ?? "#123F2D" }} />
                )}
                <div className="p-7">
                  <p className="text-[0.66rem] font-bold uppercase tracking-wider text-gold-text">Latest</p>
                  <h2 className="mt-2 font-display text-3xl font-semibold text-ink group-hover:text-green">{lead.title}</h2>
                  {lead.summary && <p className="mt-3 max-w-2xl text-ink-muted">{lead.summary}</p>}
                  <p className="mt-4 text-sm text-ink-faint">{lead.authorName} · {formatDate(lead.publishedAt ?? lead.createdAt)}</p>
                </div>
              </Link>
            )}
            {rest.length > 0 && (
              <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((a) => (
                  <Link key={a.id} to={`/news/${a.slug}`} className="group flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)]">
                    {a.coverImageUrl ? (
                      <img src={cldCover(a.coverImageUrl, 600)} alt="" loading="lazy" className="h-40 w-full object-cover" />
                    ) : (
                      <div className="h-2.5 w-full" style={{ backgroundColor: a.coverColor ?? "#123F2D" }} />
                    )}
                    <div className="flex flex-1 flex-col p-6">
                      <h3 className="font-display text-xl font-semibold text-ink group-hover:text-green">{a.title}</h3>
                      {a.summary && <p className="mt-2 text-sm text-ink-muted">{a.summary}</p>}
                      <p className="mt-4 text-xs text-ink-faint">{a.authorName} · {formatDate(a.publishedAt ?? a.createdAt)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </Container>
    </>
  );
}
