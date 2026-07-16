import { useState } from "react";
import { Link } from "react-router-dom";
import { Container } from "@/components/ui";
import { AiWritingBar } from "@/components/ai-writing-bar";
import { ImageUpload } from "@/components/image-upload";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";

const DEFAULT_BODY =
  "hi all, we r having our speech and prize giving day on 22nd nov 2025 at the school park. pls all parents old students and well wishers should come. doors open 8am, kids should be there by 730 in uniform. come celebrate the children with us";

const COVER_COLORS = ["#123F2D", "#B0503C", "#0E7C6B", "#B07D32", "#7C2D2D"];

export function Component() {
  const { member } = useAuth();
  const canPublish = !member || ["curator", "steward", "editor"].includes(member.role);

  const [title, setTitle] = useState("Speech & Prize-Giving Day");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState(DEFAULT_BODY);
  const [coverColor, setCoverColor] = useState(COVER_COLORS[0]);
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "publishing">("idle");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ slug: string; published: boolean } | null>(null);

  async function persist(publish: boolean) {
    setError(null); setDone(null);
    if (title.trim().length < 3) { setError("Give the article a title (3+ characters)."); return; }
    if (!body.trim()) { setError("The article needs a body."); return; }
    setState(publish ? "publishing" : "saving");
    try {
      const article = await api.createNews({ title: title.trim(), summary: summary.trim() || undefined, body, coverColor, coverImageUrl: coverImageUrl || undefined });
      if (publish) await api.publishNews(article.id);
      setDone({ slug: article.slug, published: publish });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not save the article.";
      setError((e as { status?: number }).status === 403 ? "You need curator or editor access to publish to the Newsroom." : msg);
    } finally {
      setState("idle");
    }
  }

  return (
    <>
      <section className="on-dark on-dark-pin bg-green-slate text-cream">
        <Container className="py-8">
          <p className="text-sm text-cream/70">
            <Link to="/admin" className="hover:text-gold">Dashboard</Link>
            <span className="px-2 text-cream/40">›</span>Newsroom<span className="px-2 text-cream/40">›</span><span className="text-cream">Compose</span>
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Compose</h1>
          <p className="mt-1 text-sm text-cream/70">Draft with the AI writing bar, then publish straight to the Newsroom — you keep full control of the final words.</p>
        </Container>
      </section>

      <Container size="narrow" className="py-10">
        {done ? (
          <div className="rounded-[var(--radius-card)] border border-green/30 bg-green/[0.06] p-6 text-center">
            <p className="text-2xl font-semibold text-green-text">{done.published ? "Published to the Newsroom" : "Saved as a draft"}</p>
            <p className="mt-2 text-sm text-ink-muted">
              {done.published
                ? "Your article is live for the community."
                : "Stewards can publish it from the admin Newsroom."}
            </p>
            <div className="mt-5 flex justify-center gap-3">
              {done.published && <Link to={`/news/${done.slug}`} className="rounded-full bg-green px-5 py-2 text-sm font-semibold text-on-green hover:bg-green-900">View it →</Link>}
              <button type="button" onClick={() => { setDone(null); setTitle(""); setSummary(""); setBody(""); setCoverImageUrl(""); }} className="rounded-full border border-sand px-5 py-2 text-sm font-semibold text-ink hover:border-ink">Write another</button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-5 rounded-[var(--radius-card)] border border-sand bg-cream p-5">
              <label htmlFor="compose-headline" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-faint">Headline</label>
              <input id="compose-headline" value={title} onChange={(e) => setTitle(e.target.value)} className="mb-4 w-full rounded-lg border border-sand bg-paper px-3.5 py-2.5 text-lg font-semibold text-ink focus:border-green focus:outline-none" />
              <label htmlFor="compose-summary" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-faint">Summary <span className="font-normal normal-case text-ink-faint">(optional)</span></label>
              <input id="compose-summary" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="One line that appears on the news cards" className="mb-4 w-full rounded-lg border border-sand bg-paper px-3.5 py-2.5 text-ink focus:border-green focus:outline-none" />
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-faint">Cover colour</span>
              <div className="flex gap-2">
                {COVER_COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setCoverColor(c)} aria-label={`Cover ${c}`} className={`h-8 w-8 rounded-full border-2 ${coverColor === c ? "border-ink" : "border-transparent"}`} style={{ backgroundColor: c }} />
                ))}
              </div>
              <div className="mt-4">
                <ImageUpload
                  value={coverImageUrl}
                  onChange={setCoverImageUrl}
                  label="Cover image (optional)"
                  hint="Upload a photo for the article — stored on Cloudinary. Falls back to the cover colour if none is set."
                />
              </div>
            </div>

            <AiWritingBar label="Article body (Markdown)" showTitle={false} value={body} onChange={setBody} rows={10} />

            {error && <p className="mt-4 text-sm text-clay-text">{error}</p>}
            {!canPublish && <p className="mt-4 text-sm text-gold-text">Heads up: publishing to the Newsroom needs curator or editor access.</p>}

            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" onClick={() => persist(true)} disabled={state !== "idle"} className="rounded-full bg-green px-6 py-2.5 text-sm font-semibold text-on-green hover:bg-green-900 disabled:opacity-60">
                {state === "publishing" ? "Publishing…" : "Publish to Newsroom"}
              </button>
              <button type="button" onClick={() => persist(false)} disabled={state !== "idle"} className="rounded-full border border-sand px-6 py-2.5 text-sm font-semibold text-ink hover:border-ink disabled:opacity-60">
                {state === "saving" ? "Saving…" : "Save as draft"}
              </button>
            </div>
          </>
        )}

        <div className="mt-8 rounded-[var(--radius-card)] border border-ai-line bg-ai-tint p-5 text-sm text-ink-muted">
          <p className="font-semibold text-ai">How this works</p>
          <p className="mt-2">The AI bar drafts and improves text via a server-side prompt template in the Go API — keys never reach the browser, and calls are metered against a daily budget. Publishing creates a real Newsroom article (<code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs">/api/admin/news</code>); set <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs">ANTHROPIC_API_KEY</code> on the backend for live Claude output.</p>
        </div>
      </Container>
    </>
  );
}
