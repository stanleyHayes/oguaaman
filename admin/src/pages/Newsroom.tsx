import { useMemo, useState } from "react";
import { useLoaderData, useNavigate, Link } from "react-router-dom";
import { api } from "@/lib/api";
import type { NewsArticle } from "@/lib/types";
import { PageHeader, Card, Empty } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { cldCover } from "@/lib/cloudinary";

export async function loader() {
  return api.news();
}

type Filter = "all" | "published" | "draft";

function StatusChip({ status }: Readonly<{ status: NewsArticle["status"] }>) {
  const cls = status === "published" ? "bg-green/[0.1] text-green" : "bg-gold/[0.16] text-gold-text";
  const dot = status === "published" ? "bg-green" : "bg-gold-brand";
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.65rem] font-semibold capitalize ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      {status}
    </span>
  );
}

function Cover({ a }: Readonly<{ a: Pick<NewsArticle, "coverImageUrl" | "coverColor"> }>) {
  if (a.coverImageUrl) {
    return <img src={cldCover(a.coverImageUrl, 160)} alt="" className="h-16 w-24 shrink-0 rounded-lg border border-sand object-cover sm:h-20 sm:w-32" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />;
  }
  return <span className="h-16 w-24 shrink-0 rounded-lg border border-sand sm:h-20 sm:w-32" style={{ backgroundColor: a.coverColor ?? "#123F2D" }} aria-hidden />;
}

export function Component() {
  const list = useLoaderData() as NewsArticle[];
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => ({
    all: list.length,
    published: list.filter((a) => a.status === "published").length,
    draft: list.filter((a) => a.status === "draft").length,
  }), [list]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((a) => {
      if (filter !== "all" && a.status !== filter) return false;
      if (q && !`${a.title} ${a.summary ?? ""} ${(a.tags ?? []).join(" ")}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [list, filter, query]);

  return (
    <>
      <PageHeader kicker="Spec §8.12 · editorial" title="Newsroom">
        <Link to="/newsroom/new" className="inline-flex items-center gap-1.5 rounded-full bg-green px-4 py-2 text-sm font-semibold text-cream transition-colors hover:bg-green-900">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
          New article
        </Link>
      </PageHeader>

      {/* filter + search bar */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full border border-sand bg-paper p-0.5 text-sm">
          {(["all", "published", "draft"] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3.5 py-1.5 font-semibold capitalize transition-colors ${filter === f ? "bg-green text-cream" : "text-ink-muted hover:text-ink"}`}>
              {f} <span className={filter === f ? "text-cream/70" : "text-ink-faint"}>{counts[f]}</span>
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-72">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search articles…" className="w-full rounded-full border border-sand bg-paper py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-gold-border focus:outline-none" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty title={list.length === 0 ? "No articles yet" : "No matches"} actions={list.length === 0 ? <Link to="/newsroom/new" className="rounded-full bg-green px-4 py-2 text-sm font-semibold text-cream hover:bg-green-900">+ Write the first article</Link> : undefined}>
          {list.length === 0 ? "The Newsroom is empty. Write Cape Coast's first notice." : "Try a different search or filter."}
        </Empty>
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => (
            <Card key={a.id} className="overflow-hidden transition-shadow hover:shadow-[var(--shadow-lift,0_8px_24px_rgba(0,0,0,0.08))]">
              <button onClick={() => navigate(`/newsroom/${a.id}`)} className="flex w-full items-center gap-4 p-3 text-left">
                <Cover a={a} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-lg font-semibold text-ink">{a.title || "Untitled"}</h3>
                    <StatusChip status={a.status} />
                  </div>
                  {a.summary && <p className="mt-0.5 line-clamp-1 text-sm text-ink-muted">{a.summary}</p>}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[0.7rem] text-ink-faint">
                    <span>{a.authorName}</span>
                    <span aria-hidden>·</span>
                    <span>updated {formatDate(a.updatedAt)}</span>
                    {(a.tags ?? []).slice(0, 3).map((t) => <span key={t} className="rounded-full border border-sand bg-paper px-2 py-0.5 text-ink-muted">{t}</span>)}
                  </div>
                </div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-faint" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
              </button>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
