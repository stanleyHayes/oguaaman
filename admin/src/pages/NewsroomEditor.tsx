import { useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { useLoaderData, useNavigate, type LoaderFunctionArgs } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { api, ApiError, type NewsPayload } from "@/lib/api";
import type { NewsArticle, NewsResearchJob } from "@/lib/types";
import { Card, BackLink } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { ImageUpload } from "@/components/image-upload";
import { AiWritingBar } from "@/components/ai-writing-bar";
import { formatDate } from "@/lib/format";
import { mediaUrl } from "@/lib/cloudinary";
import { BusyLabel } from "@/components/skeleton";
import { FieldError, FlagChip, Panel, ToneChip } from "@/components/admin-kit";
import { ReportDraftReview, SourceList } from "@/components/report-draft";
import { JOB_STATUS_LABEL, JOB_STATUS_TONE } from "@/lib/newsdesk";
import { describeError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { btnPrimary, inputCls, segmentCls } from "@/lib/ui-classes";

const BLANK: NewsPayload = { title: "", summary: "", body: "", coverColor: "#123F2D", coverImageUrl: "", tags: [] };
const COVERS = ["#123F2D", "#B0503C", "#0E7C6B", "#7C2D2D", "#B07D32", "#3B473D"];

interface EditorData { article: NewsArticle | null; job: NewsResearchJob | null }

/** The research job behind an automated article; most articles have none (404). */
async function researchJob(id: string): Promise<NewsResearchJob | null> {
  try {
    return await api.newsResearch(id);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) return null;
    throw e;
  }
}

// One loader for both routes: fetch the article (and any research job) for
// /newsroom/:id, nothing for /newsroom/new.
export async function loader({ params }: LoaderFunctionArgs): Promise<EditorData> {
  if (!params.id) return { article: null, job: null };
  const [article, job] = await Promise.all([api.newsGet(params.id), researchJob(params.id)]);
  return { article, job };
}

function wordStats(body: string): { words: number; mins: number } {
  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  return { words, mins: Math.max(1, Math.round(words / 200)) };
}

function payloadOf(a: NewsArticle): NewsPayload {
  return { title: a.title, summary: a.summary ?? "", body: a.body, coverColor: a.coverColor ?? "#123F2D", coverImageUrl: a.coverImageUrl ?? "", tags: a.tags ?? [] };
}

export function Component() {
  const { article: loaded, job: loadedJob } = useLoaderData() as EditorData;
  const navigate = useNavigate();
  const isNew = !loaded;
  const [job, setJob] = useState<NewsResearchJob | null>(loadedJob);
  const [tab, setTab] = useState<"article" | "report">(loadedJob?.status === "ready" ? "report" : "article");

  const [article, setArticle] = useState<NewsArticle | null>(loaded);
  const [form, setForm] = useState<NewsPayload>(loaded ? payloadOf(loaded) : BLANK);
  const [original, setOriginal] = useState<NewsPayload>(loaded ? payloadOf(loaded) : BLANK);
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const dirty = JSON.stringify(form) !== JSON.stringify(original);
  const { words, mins } = useMemo(() => wordStats(form.body), [form.body]);

  async function save() {
    setBusy(true); setErr("");
    try {
      if (isNew) {
        const created = await api.newsCreate(form);
        navigate(`/newsroom/${created.id}`); // becomes the edit page (loader refetches)
        return;
      }
      const updated = await api.newsUpdate(article!.id, form);
      setArticle(updated); setForm(payloadOf(updated)); setOriginal(payloadOf(updated));
      setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1600);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  function approved(a: NewsArticle) {
    setArticle(a);
    setForm(payloadOf(a));
    setOriginal(payloadOf(a));
    setTab("article");
  }

  async function togglePublish() {
    if (!article) return;
    setBusy(true);
    try {
      const next = article.status !== "published";
      await api.newsPublish(article.id, next);
      setArticle({ ...article, status: next ? "published" : "draft" });
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!article) return;
    setBusy(true);
    try { await api.newsDelete(article.id); navigate("/newsroom"); }
    finally { setBusy(false); }
  }

  return (
    <>
      <BackLink to="/newsroom">All articles</BackLink>

      <EditorHeader
        article={article}
        isNew={isNew}
        dirty={dirty}
        savedFlash={savedFlash}
        busy={busy}
        onSave={save}
        onTogglePublish={togglePublish}
        onDelete={remove}
      />

      {job && article && (
        <nav aria-label="Editor views" className="mb-4 flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-full border border-sand bg-paper p-1">
            <button type="button" aria-pressed={tab === "article"} onClick={() => setTab("article")} className={segmentCls(tab === "article")}>Article</button>
            <button type="button" aria-pressed={tab === "report"} onClick={() => setTab("report")} className={segmentCls(tab === "report")}>
              Report draft
            </button>
          </div>
          <ToneChip tone={JOB_STATUS_TONE[job.status]}>{JOB_STATUS_LABEL[job.status]}</ToneChip>
        </nav>
      )}

      {tab === "report" && job && article ? (
        <ReportDraftReview articleId={article.id} job={job} onJob={setJob} onApproved={approved} />
      ) : (
      <>
      <Card className="overflow-hidden">
        {/* cover banner — the photo, or the chosen colour */}
        <div className="relative h-28 w-full" style={{ backgroundColor: form.coverColor }}>
          {form.coverImageUrl && <img src={mediaUrl(form.coverImageUrl)} alt="" className="h-full w-full object-cover" />}
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-sand px-5 py-3">
          <div className="inline-flex rounded-full border border-sand bg-paper p-0.5 text-sm">
            {(["write", "preview"] as const).map((m) => (
              <button type="button" key={m} onClick={() => setMode(m)} className={`rounded-full px-3 py-1 font-medium capitalize transition-colors ${mode === m ? "bg-green text-on-green" : "text-ink-muted hover:text-ink"}`}>{m}</button>
            ))}
          </div>
          <span className="text-[0.7rem] text-ink-faint">{words} words · {mins} min read</span>
        </div>

        {err && <p className="mx-5 mt-3 rounded-lg bg-clay/[0.08] px-3 py-2 text-sm text-clay-text">{err}</p>}

        {mode === "write" ? (
          <WritePane form={form} setForm={setForm} bodyRef={bodyRef} />
        ) : (
          <PreviewPane form={form} />
        )}
      </Card>

      {article && (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <SourcesPanel article={article} />
          <CorrectionsPanel article={article} onChange={setArticle} />
        </div>
      )}

      <div className="mt-4">
        <AiWritingBar initialTitle={form.title} initialBody={form.body} />
      </div>
      </>
      )}
    </>
  );
}

/** Where an automated article came from (read-only). */
function SourcesPanel({ article }: Readonly<{ article: NewsArticle }>) {
  const sources = article.sources ?? [];
  const hasFeed = Boolean(article.sourceName || article.sourceUrl);
  if (!hasFeed && sources.length === 0) {
    return (
      <Panel title="Sources" aside="Written by staff. Automated briefs and reports list their sources here.">
        <p className="text-sm text-ink-muted">No external sources recorded.</p>
      </Panel>
    );
  }
  return (
    <Panel title="Sources" aside={article.tier === "report" ? "Numbered as they appear in the published report." : "The feed item this brief links to."}>
      {hasFeed && (
        <dl className="mb-3 space-y-1 text-sm">
          {article.sourceName && <div className="flex gap-2"><dt className="w-20 shrink-0 text-ink-faint">Feed</dt><dd className="text-ink">{article.sourceName}</dd></div>}
          {article.sourceAuthor && <div className="flex gap-2"><dt className="w-20 shrink-0 text-ink-faint">Author</dt><dd className="text-ink">{article.sourceAuthor}</dd></div>}
          {article.sourcePublishedAt && <div className="flex gap-2"><dt className="w-20 shrink-0 text-ink-faint">Published</dt><dd className="tabular-nums text-ink">{formatDateTime(article.sourcePublishedAt)}</dd></div>}
          {article.sourceUrl && (
            <div className="flex gap-2"><dt className="w-20 shrink-0 text-ink-faint">Link</dt>
              <dd className="min-w-0"><a href={article.sourceUrl} target="_blank" rel="noopener noreferrer" className="break-all text-green-text underline underline-offset-4">{article.sourceUrl}</a></dd>
            </div>
          )}
        </dl>
      )}
      {sources.length > 0 && <SourceList sources={sources} />}
      {(article.tier === "report" || article.coverImageKind === "ai") && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-sand pt-3">
          {article.tier === "report" && <FlagChip tone="ai">AI-assisted</FlagChip>}
          {article.coverImageKind === "ai" && <FlagChip tone="ai">AI illustration</FlagChip>}
          {article.political && <FlagChip tone="clay">Election coverage</FlagChip>}
          {article.reviewedByName && <span className="text-xs text-ink-faint">Reviewed by {article.reviewedByName}{article.reviewedAt ? `, ${formatDateTime(article.reviewedAt)}` : ""}</span>}
        </div>
      )}
    </Panel>
  );
}

/** Dated public corrections: never silent edits (spec §2.9). */
function CorrectionsPanel({ article, onChange }: Readonly<{ article: NewsArticle; onChange: (a: NewsArticle) => void }>) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const corrections = [...(article.corrections ?? [])].reverse();

  async function add() {
    const text = note.trim();
    if (text.length < 5) { setError("Write the correction in a full sentence (at least 5 characters)."); return; }
    setBusy(true);
    setError("");
    try {
      onChange(await api.newsCorrection(article.id, text));
      setNote("");
      setSaved(true);
    } catch (e) {
      setError(describeError(e, {}, "We couldn't add the correction. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Corrections" aside="Shown to readers under the article with the date. Fix the text above too; the note says what changed.">
      {corrections.length > 0 && (
        <ol className="mb-4 space-y-2">
          {corrections.map((c) => (
            <li key={`${c.at}-${c.note.slice(0, 12)}`} className="rounded-lg border border-sand bg-paper px-3 py-2 text-sm">
              <time dateTime={c.at} className="text-xs tabular-nums text-ink-faint">{formatDateTime(c.at)}</time>
              <p className="mt-0.5 leading-relaxed text-ink">{c.note}</p>
            </li>
          ))}
        </ol>
      )}
      <label htmlFor="correction-note" className="sr-only">Correction note</label>
      <textarea
        id="correction-note"
        value={note}
        onChange={(e) => { setNote(e.target.value); setError(""); setSaved(false); }}
        rows={3}
        maxLength={500}
        placeholder="e.g. An earlier version gave the wrong date for the durbar. It is on 6 September."
        aria-invalid={Boolean(error) || undefined}
        className={inputCls}
      />
      <FieldError>{error}</FieldError>
      <div className="mt-2 flex items-center gap-3">
        <button type="button" onClick={add} disabled={busy || !note.trim()} className={btnPrimary}>
          {busy ? <BusyLabel label="Adding the correction" tone="dark" /> : "Add correction"}
        </button>
        <span className="text-[0.7rem] tabular-nums text-ink-faint">{note.trim().length}/500</span>
        {saved && <span role="status" className="text-sm text-green-text">Correction added.</span>}
      </div>
    </Panel>
  );
}

function eyebrowLabel(isNew: boolean, article: NewsArticle | null): string {
  if (isNew) return "New article";
  return article?.status === "published" ? "Published article" : "Draft";
}

function SaveIndicator({ dirty, savedFlash, busy }: Readonly<{ dirty: boolean; savedFlash: boolean; busy: boolean }>) {
  if (busy) return <BusyLabel label="Updating article" width="w-14" />;
  if (dirty) return <span className="text-xs font-medium text-clay-text">● Unsaved changes</span>;
  if (savedFlash) return <span className="text-xs font-medium text-green-text">Saved ✓</span>;
  return null;
}

function EditorHeader({ article, isNew, dirty, savedFlash, busy, onSave, onTogglePublish, onDelete }: Readonly<{
  article: NewsArticle | null;
  isNew: boolean;
  dirty: boolean;
  savedFlash: boolean;
  busy: boolean;
  onSave: () => void;
  onTogglePublish: () => void;
  onDelete: () => void;
}>) {
  const [confirmDel, setConfirmDel] = useState(false);
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="eyebrow text-ai">{eyebrowLabel(isNew, article)}</p>
        <h1 className="mt-1 text-3xl font-semibold">{isNew ? "Write a new article" : "Edit article"}</h1>
        {article && <p className="mt-1 text-sm text-ink-faint">{article.authorName} · updated {formatDate(article.updatedAt)}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SaveIndicator dirty={dirty} savedFlash={savedFlash} busy={busy} />
        <button type="button" onClick={onSave} disabled={busy || !dirty} className="rounded-full border border-sand bg-paper px-4 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-gold-border hover:text-gold-text disabled:opacity-40">
          {isNew ? "Save draft" : "Save"}
        </button>
        {article && (
          <button type="button" onClick={onTogglePublish} disabled={busy} className={article.status === "published"
            ? "rounded-full border border-maroon-text/50 px-4 py-1.5 text-xs font-semibold text-maroon-text transition-colors hover:bg-maroon-900/[0.06] disabled:opacity-50"
            : "rounded-full bg-green px-4 py-1.5 text-xs font-semibold text-on-green transition-colors hover:bg-green-900 disabled:opacity-50"}>
            {article.status === "published" ? "Unpublish" : "Publish"}
          </button>
        )}
        {article && (
          <AnimatePresence initial={false}>
            {confirmDel && (
              <motion.span
                key="confirm-delete"
                className="inline-flex items-center gap-1"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.15 }}
              >
                <button type="button" onClick={onDelete} disabled={busy} className="rounded-full bg-maroon-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Confirm delete</button>
                <button type="button" onClick={() => setConfirmDel(false)} className="rounded-full px-2 py-1.5 text-xs font-medium text-ink-muted hover:text-ink">Cancel</button>
              </motion.span>
            )}
          </AnimatePresence>
        )}
        {article && !confirmDel && (
          <button type="button" onClick={() => setConfirmDel(true)} className="rounded-full border border-sand px-3 py-1.5 text-xs font-semibold text-ink-muted transition-colors hover:border-maroon-text hover:text-maroon-text">Delete</button>
        )}
      </div>
    </div>
  );
}

function WritePane({ form, setForm, bodyRef }: Readonly<{
  form: NewsPayload;
  setForm: Dispatch<SetStateAction<NewsPayload>>;
  bodyRef: RefObject<HTMLTextAreaElement | null>;
}>) {
  const [tagDraft, setTagDraft] = useState("");
  const toolBtn = "rounded px-2.5 py-1 text-sm text-ink-muted transition-colors hover:bg-sand hover:text-ink";

  function surround(before: string, after = before) {
    const el = bodyRef.current; if (!el) return;
    const { selectionStart: s, selectionEnd: e, value } = el;
    const sel = value.slice(s, e) || "text";
    setForm((f) => ({ ...f, body: value.slice(0, s) + before + sel + after + value.slice(e) }));
    queueMicrotask(() => { el.focus(); el.selectionStart = s + before.length; el.selectionEnd = s + before.length + sel.length; });
  }
  function linePrefix(prefix: string) {
    const el = bodyRef.current; if (!el) return;
    const { selectionStart: s, value } = el;
    const ls = value.lastIndexOf("\n", s - 1) + 1;
    setForm((f) => ({ ...f, body: value.slice(0, ls) + prefix + value.slice(ls) }));
    queueMicrotask(() => { el.focus(); el.selectionStart = el.selectionEnd = s + prefix.length; });
  }

  function addTag() {
    let t = tagDraft.trim();
    while (t.endsWith(",")) t = t.slice(0, -1);
    t = t.trim();
    if (t && !(form.tags ?? []).includes(t)) setForm((f) => ({ ...f, tags: [...(f.tags ?? []), t] }));
    setTagDraft("");
  }
  function removeTag(t: string) { setForm((f) => ({ ...f, tags: (f.tags ?? []).filter((x) => x !== t) })); }

  return (
    <div className="space-y-3 p-5">
      <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Headline" aria-label="Article headline" className="w-full rounded-lg border border-sand bg-cream px-3.5 py-2.5 text-2xl font-semibold text-ink placeholder:text-ink-faint focus:border-gold-border focus:outline-none" />
      <input value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="One-line summary — shown on the news cards" aria-label="Article summary" className="w-full rounded-lg border border-sand bg-cream px-3.5 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-gold-border focus:outline-none" />

      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-sand bg-paper px-2 py-1.5">
        {/* Inline handlers so ref access stays inside event handlers (eslint react-hooks/refs). */}
        <button type="button" onClick={() => linePrefix("## ")} title="Heading" className={toolBtn}>H2</button>
        <button type="button" onClick={() => surround("**")} title="Bold" className={`${toolBtn} font-bold`}>B</button>
        <button type="button" onClick={() => surround("_")} title="Italic" className={`${toolBtn} italic`}>i</button>
        <button type="button" onClick={() => linePrefix("> ")} title="Quote" className={toolBtn}>❝</button>
        <button type="button" onClick={() => linePrefix("- ")} title="List" className={toolBtn}>•</button>
        <button type="button" onClick={() => surround("[", "](https://)")} title="Link" className={toolBtn}>🔗</button>
      </div>

      <textarea ref={bodyRef} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Write in Markdown — # heading, **bold**, - lists, > quote, [link](url)…" rows={16} aria-label="Article body" className="w-full resize-y rounded-lg border border-sand bg-cream px-3.5 py-3 font-mono text-sm leading-relaxed text-ink placeholder:text-ink-faint focus:border-gold-border focus:outline-none" />

      <div>
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-faint">Tags</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {(form.tags ?? []).map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full border border-sand bg-paper px-2.5 py-1 text-xs text-ink-muted">
              {t}
              <button type="button" onClick={() => removeTag(t)} className="text-ink-faint hover:text-maroon-text" aria-label={`Remove ${t}`}>×</button>
            </span>
          ))}
          <input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); } }}
            onBlur={addTag}
            placeholder="add tag…"
            className="w-28 rounded-full border border-dashed border-sand bg-cream px-3 py-1 text-xs text-ink placeholder:text-ink-faint focus:border-gold-border focus:outline-none"
          />
        </div>
      </div>

      <div className="grid gap-4 border-t border-sand pt-4 sm:grid-cols-[1fr_auto]">
        <ImageUpload
          value={form.coverImageUrl}
          onChange={(url) => setForm({ ...form, coverImageUrl: url })}
          label="Cover image (optional)"
          hint="Used in the article header and on cards. Falls back to the colour →"
        />
        <div>
          <span className="mb-1.5 block text-sm font-medium text-ink">Cover colour</span>
          <div className="flex flex-wrap gap-2">
            {COVERS.map((c) => (
              <button type="button" key={c} onClick={() => setForm({ ...form, coverColor: c })} aria-label={`cover ${c}`} className={`h-7 w-7 rounded-full transition-shadow ${form.coverColor === c ? "ring-2 ring-gold ring-offset-2 ring-offset-cream" : ""}`} style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewPane({ form }: Readonly<{ form: NewsPayload }>) {
  return (
    <article className="px-5 py-6">
      <p className="text-[0.7rem] font-bold uppercase tracking-wider text-gold-text">Preview</p>
      <h1 className="mt-1 text-3xl font-semibold text-ink">{form.title || "Untitled"}</h1>
      {form.summary && <p className="mt-2 text-lg text-ink-muted">{form.summary}</p>}
      {(form.tags ?? []).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(form.tags ?? []).map((t) => <span key={t} className="rounded-full border border-sand bg-paper px-2.5 py-0.5 text-xs text-ink-muted">{t}</span>)}
        </div>
      )}
      <div className="mt-5 border-t border-sand pt-5">
        {form.body.trim() ? <Markdown allowImages={false}>{form.body}</Markdown> : <p className="italic text-ink-faint">Nothing to preview yet.</p>}
      </div>
    </article>
  );
}
