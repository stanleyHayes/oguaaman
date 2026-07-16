import { useState } from "react";
import { Link, useLoaderData } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { canWriteNews, isAuthorityManager } from "@/lib/creator";
import { Card, Empty } from "@/components/ui";
import { ImageUpload } from "@/components/image-upload";
import { formatDate } from "@/lib/format";
import type { NewsArticle, NewsStatus } from "@/lib/types";
import { PenLine, Send } from "lucide-react";

/** The writer's own posts in every status — drafts and in-review included. */
export async function loader(): Promise<NewsArticle[]> {
  return api.myNews().catch(() => [] as NewsArticle[]);
}

const inputCls =
  "w-full rounded-lg border border-sand bg-paper px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-green focus:outline-none focus:ring-2 focus:ring-green/15";

const COVER_COLORS = ["#123F2D", "#7A1F2B", "#B8862B", "#1F5E57", "#8A3B1E"];

function NewsStatusBadge({ status }: Readonly<{ status: NewsStatus }>) {
  const cls = status === "published" ? "bg-green/[0.1] text-green-text" : "bg-gold/[0.18] text-gold-text";
  const label = status === "published" ? "Live" : "In review";
  return <span className={`inline-block shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

export function Component() {
  const { member } = useAuth();
  const initial = useLoaderData() as NewsArticle[];
  const [posts, setPosts] = useState<NewsArticle[]>(initial);

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [cover, setCover] = useState("");
  const [coverColor, setCoverColor] = useState<string>(COVER_COLORS[0]);
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<NewsStatus | null>(null);

  // Only writers and verified-authority managers reach the composer.
  if (member && !canWriteNews(member)) {
    return (
      <>
        <Header />
        <Empty icon="pen" title="Writing isn't switched on yet">
          Add the <strong className="text-ink">Writer</strong> hat on your{" "}
          <Link to="/account" className="font-semibold text-gold-text hover:underline">Account page</Link>{" "}
          to draft stories and news for the town. Verified authority managers can post official notices here too.
        </Empty>
      </>
    );
  }

  const publishesDirectly = member ? isAuthorityManager(member) : false;
  const canSubmit = title.trim().length >= 3 && body.trim().length > 0 && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true); setErr(null); setDone(null);
    try {
      const article = await api.submitNews({
        title: title.trim(),
        summary: summary.trim() || undefined,
        body: body.trim(),
        coverImageUrl: cover || undefined,
        coverColor: coverColor || undefined,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      setPosts((cur) => [article, ...cur.filter((p) => p.id !== article.id)]);
      setDone(article.status);
      setTitle(""); setSummary(""); setBody(""); setCover(""); setTags(""); setCoverColor(COVER_COLORS[0]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not submit your post.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Header />

      <div className="grid items-start gap-4 lg:grid-cols-3">
        {/* Composer */}
        <Card className="overflow-hidden lg:col-span-2">
          <div className="border-b border-sand px-5 py-4">
            <h2 className="text-lg font-semibold text-ink">Compose a post</h2>
            <p className="mt-0.5 text-sm text-ink-muted">
              {publishesDirectly
                ? "As a verified authority, your post publishes to the news feed straight away."
                : "Your draft goes to the newsroom — a curator reviews it before it's published."}
            </p>
          </div>
          <div className="space-y-4 p-5">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">Title</span>
              <input value={title} onChange={(e) => { setTitle(e.target.value); setDone(null); }} className={inputCls}
                placeholder="A clear headline (3–160 characters)" maxLength={160} />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">Summary <span className="font-normal text-ink-faint">(optional)</span></span>
              <input value={summary} onChange={(e) => setSummary(e.target.value)} className={inputCls}
                placeholder="One line shown on the news list." />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">Body <span className="font-normal text-ink-faint">(Markdown)</span></span>
              <textarea value={body} onChange={(e) => { setBody(e.target.value); setDone(null); }} rows={12}
                className={`${inputCls} resize-y font-mono text-[0.8rem] leading-relaxed`}
                placeholder={"Write your story here.\n\n## Use headings\n\n**Bold**, *italics*, and [links](https://…) all work."} />
            </label>

            <ImageUpload value={cover} onChange={setCover} label="Cover image (optional)" />

            <div>
              <span className="mb-1.5 block text-sm font-medium text-ink">Accent colour</span>
              <div className="flex flex-wrap items-center gap-2">
                {COVER_COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setCoverColor(c)} aria-label={`Accent ${c}`} aria-pressed={coverColor === c}
                    className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-105 ${coverColor === c ? "border-ink ring-2 ring-gold/30" : "border-cream"}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">Tags <span className="font-normal text-ink-faint">(comma-separated)</span></span>
              <input value={tags} onChange={(e) => setTags(e.target.value)} className={inputCls} placeholder="festival, chieftaincy, education" />
            </label>

            {err && <p className="rounded-lg border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay-text">{err}</p>}
            {done && (
              <p className="rounded-lg bg-teal/[0.12] px-3 py-2 text-sm font-medium text-teal-text">
                {done === "published" ? "Published — it's live on the news feed. ✓" : "Submitted — a curator will review it shortly. ✓"}
              </p>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button onClick={submit} disabled={!canSubmit}
                className="inline-flex items-center gap-2 rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-on-green transition-colors hover:bg-green-900 disabled:opacity-50">
                <Send size={15} aria-hidden /> {busy ? "Submitting…" : publishesDirectly ? "Publish post" : "Submit for review"}
              </button>
              <span className="text-xs text-ink-faint">Title needs at least 3 characters.</span>
            </div>
          </div>
        </Card>

        {/* Submitted posts */}
        <Card className="overflow-hidden">
          <div className="border-b border-sand px-5 py-4">
            <h2 className="text-lg font-semibold text-ink">Your posts</h2>
            <p className="mt-0.5 text-sm text-ink-muted">Everything you've submitted, with its review status.</p>
          </div>
          {posts.length === 0 ? (
            <Empty compact icon="pen" title="Nothing submitted yet">Your first post shows up here.</Empty>
          ) : (
            <ul className="divide-y divide-sand">
              {posts.map((p) => (
                <li key={p.id} className="flex items-start gap-3 px-5 py-3.5">
                  <span className="mt-0.5 h-9 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: p.coverColor ?? "#123F2D" }} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{p.title}</p>
                    <p className="mt-0.5 text-xs text-ink-faint">{formatDate(p.publishedAt ?? p.createdAt)}</p>
                  </div>
                  <NewsStatusBadge status={p.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function Header() {
  return (
    <div className="mb-6 flex items-center gap-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold/[0.12] text-gold-text">
        <PenLine size={20} aria-hidden />
      </span>
      <div>
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-gold-text">Newsroom</p>
        <h1 className="text-3xl font-semibold text-ink">Write &amp; publish</h1>
      </div>
    </div>
  );
}
