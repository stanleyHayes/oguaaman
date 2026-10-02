import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { NewsApproveChecklist, NewsArticle, NewsReportDraft, NewsResearchJob, NewsSource } from "@/lib/types";
import { Markdown } from "@/components/markdown";
import { FieldError, FlagChip, Notice, Panel, ReasonAction, ToneChip } from "@/components/admin-kit";
import { BusyLabel } from "@/components/skeleton";
import { cldCover } from "@/lib/cloudinary";
import { describeError, errorCode, errorField } from "@/lib/errors";
import { formatDate, formatDateTime, percent, usd } from "@/lib/format";
import {
  CHECKLIST_ITEMS, COVER_SKIP_LABEL, JOB_STATUS_LABEL, JOB_STATUS_TONE, badMarkers, canRerun, draftFlagLabel, jobCost, linkCitations, regenerateCoverMessage,
} from "@/lib/newsdesk";
import { btnDanger, btnDangerOutline, btnPrimary, btnSecondary, btnSmall, inputCls, labelCls, segmentCls } from "@/lib/ui-classes";

const TITLE_MAX = 90;
const SUMMARY_MAX = 220;

const DRAFT_ERRORS: Readonly<Record<string, string>> = {
  job_not_ready: "This draft is no longer waiting for review. Reload the page to see its status.",
  checklist_incomplete: "Every checklist item must be ticked before publishing.",
  invalid_title: `The headline must be 1 to ${TITLE_MAX} characters.`,
  invalid_summary: `The summary must be 1 to ${SUMMARY_MAX} characters.`,
  invalid_markers: "A [n] marker in the body points past the source list.",
  job_not_rerunnable: "This job can't be rerun.",
  desk_disabled: "The news desk is switched off. Turn it on in Desk settings first.",
  image_cap_reached: "Today's image cap is reached. Use the branded cover, or try tomorrow.",
  images_unavailable: "AI illustrations aren't available on this server. Use the branded cover.",
  topic_blocked: "This story touches a topic AI never drafts, such as courts, crime, accidents or children. It stays a brief.",
  election_mode: "Election mode is on, so AI-assisted political reports can't be researched or published. The brief stays as it is until election mode ends.",
};

function words(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Numbered, footnote-style source list; ids match the [n] links in the preview. */
export function SourceList({ sources }: Readonly<{ sources: NewsSource[] }>) {
  if (!sources.length) return null;
  return (
    <ol className="space-y-2 text-sm">
      {sources.map((s, i) => (
        <li key={`${s.url}-${i}`} id={`src-${i + 1}`} className="grid scroll-mt-24 grid-cols-[1.75rem_1fr] gap-1 target:rounded-md target:bg-gold/[0.12]">
          <span className="pt-px text-right tabular-nums text-ink-faint">{i + 1}.</span>
          <span className="min-w-0 leading-relaxed text-ink-muted">
            <span className="font-medium text-ink">{s.name}</span>
            {s.title && <>, <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline decoration-sand underline-offset-4 transition-colors hover:text-ink hover:decoration-gold-border">{s.title}</a></>}
            {!s.title && <> · <a href={s.url} target="_blank" rel="noopener noreferrer" className="break-all underline decoration-sand underline-offset-4 hover:text-ink">{s.url}</a></>}
            {s.author && <>, {s.author}</>}
            {s.publishedAt && <span className="tabular-nums">, {formatDate(s.publishedAt)}</span>}
            {s.original && <span className="ml-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-gold-text">Original report</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

function CoverPreview({ draft, title }: Readonly<{ draft: NewsReportDraft; title: string }>) {
  const c = draft.cover;
  if (c.kind === "ai" && c.url) {
    return (
      <figure>
        <div className="relative aspect-[3/2] overflow-hidden rounded-[10px] bg-sand">
          <img src={cldCover(c.url, 480)} alt={c.alt} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          <span className="absolute left-2 top-2 rounded-[4px] border border-ai-line bg-ai-tint px-1.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.06em] text-ai">AI illustration</span>
        </div>
        <figcaption className="mt-2 text-xs leading-relaxed text-ink-muted">AI illustration generated with OpenAI for Oguaa. It does not show the real people, place or event.</figcaption>
        {c.credit && <p className="mt-0.5 text-xs text-ink-faint">{c.credit}</p>}
      </figure>
    );
  }
  return (
    <figure>
      <div className="relative flex aspect-[3/2] flex-col justify-between overflow-hidden rounded-[10px] bg-green-900 p-4 text-on-green">
        <span aria-hidden className="absolute -right-6 -top-10 h-36 w-36 rounded-full border-[14px] border-gold/40" />
        <span aria-hidden className="absolute -bottom-12 -right-8 h-24 w-24 rounded-full border-[10px] border-sand/25" />
        <p className="relative text-[0.6rem] font-bold uppercase tracking-[0.18em] text-gold">Oguaa newsroom</p>
        <p className="relative line-clamp-3 max-w-[72%] text-base font-semibold leading-snug tracking-[-0.01em] [text-wrap:balance]">{title || "Headline"}</p>
      </div>
      <figcaption className="mt-2 text-xs text-ink-muted">Branded cover, drawn by Oguaa. No AI label.</figcaption>
      {c.skippedReason && <p className="mt-0.5 text-xs text-ink-faint">{COVER_SKIP_LABEL[c.skippedReason] ?? c.skippedReason}</p>}
    </figure>
  );
}

function JobStateNotice({ job, onRerun, busy }: Readonly<{ job: NewsResearchJob; onRerun: () => void; busy: boolean }>) {
  const lines: string[] = [];
  if (job.status === "queued") lines.push(job.nextAttemptAt ? `Queued. Next try ${formatDateTime(job.nextAttemptAt)}.` : "Queued for the research worker.");
  if (job.status === "running") lines.push("The desk is researching this lead now. It usually takes a few minutes.");
  if (job.status === "approved") lines.push(`Published${job.reviewedByName ? ` by ${job.reviewedByName}` : ""}${job.reviewedAt ? ` on ${formatDateTime(job.reviewedAt)}` : ""}. The brief was upgraded in place.`);
  if (job.status === "rejected") lines.push(`Rejected${job.reviewedByName ? ` by ${job.reviewedByName}` : ""}. The brief is unchanged.`);
  if (job.rejectReason) lines.push(`Reason: ${job.rejectReason}`);
  if (job.status === "failed") lines.push(job.lastError ? `Failed: ${job.lastError}` : "The draft failed the quality checks.");
  if (job.status === "refused") lines.push(`The model declined to write this story${job.refusalCategory ? ` (${job.refusalCategory.replaceAll("_", " ")})` : ""}.`);
  if (job.status === "no_story") lines.push("The research found no story worth a full report. The brief stays as it is.");
  if (job.status === "blocked") lines.push(`Blocked topic${job.blockedReason ? `: ${job.blockedReason.replaceAll("_", " ")}` : ""}. Topics like courts, crime and conflict are never drafted by AI.`);
  if (job.status === "stale") lines.push("The lead was more than 48 hours old by the time it was picked up.");
  return (
    <div className="rounded-[var(--radius-card)] border border-sand bg-cream p-5 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-center gap-2">
        <ToneChip tone={JOB_STATUS_TONE[job.status]}>{JOB_STATUS_LABEL[job.status]}</ToneChip>
        <span className="text-xs tabular-nums text-ink-faint">{job.attempts} attempt{job.attempts === 1 ? "" : "s"} · {usd(jobCost(job))}</span>
      </div>
      {lines.map((l) => <p key={l} className="mt-2 max-w-[65ch] text-sm leading-relaxed text-ink-muted [text-wrap:pretty]">{l}</p>)}
      {canRerun(job) && (
        <button type="button" onClick={onRerun} disabled={busy} className={`${btnSecondary} mt-4`}>
          {busy ? <BusyLabel label="Queuing the job" /> : "Research again"}
        </button>
      )}
      {job.status !== "approved" && canRerun(job) && <p className="mt-2 text-xs text-ink-faint">A rerun counts against today's caps.</p>}
    </div>
  );
}

/**
 * The editor's review surface for one researched report (spec §2.9): edit
 * the draft, check it against its numbered sources, pick the cover, tick the
 * checklist, then approve (which upgrades the brief in place) or reject.
 */
export function ReportDraftReview({ articleId, job, onJob, onApproved }: Readonly<{
  articleId: string;
  job: NewsResearchJob;
  onJob: (job: NewsResearchJob) => void;
  onApproved: (article: NewsArticle) => void;
}>) {
  const draft = job.draft;
  const [title, setTitle] = useState(draft?.title ?? "");
  const [summary, setSummary] = useState(draft?.summary ?? "");
  const [body, setBody] = useState(draft?.body ?? "");
  const [mode, setMode] = useState<"write" | "preview">("preview");
  const [checks, setChecks] = useState<NewsApproveChecklist>({
    factsMatchSources: false, noUnattributedAllegations: false, quotesAccurate: false,
    balancedIfPolitical: false, imageCompliant: false, rightOfReplyConsidered: false,
  });
  const [errors, setErrors] = useState<Partial<Record<"title" | "summary" | "body" | "checklist", string>>>({});
  const [busy, setBusy] = useState<"" | "approve" | "cover" | "rerun">("");
  const [message, setMessage] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);

  const sources = draft?.sources ?? [];
  const political = Boolean(draft?.political);
  const aiCover = draft?.cover.kind === "ai";
  const required = CHECKLIST_ITEMS.filter((c) => {
    if (c.when === "political") return political;
    if (c.when === "ai") return aiCover;
    return true;
  });
  const bad = useMemo(() => badMarkers(body, sources.length), [body, sources.length]);
  const liveWords = useMemo(() => words(body), [body]);

  async function rerun() {
    setBusy("rerun");
    setMessage(null);
    try {
      onJob(await api.newsResearchRerun(articleId));
      setMessage({ tone: "ok", text: "Queued. The desk will research it again within a few minutes." });
    } catch (e) {
      setMessage({ tone: "error", text: describeError(e, DRAFT_ERRORS, "We couldn't queue the job. Try again.") });
    } finally {
      setBusy("");
    }
  }

  if (!draft || job.status !== "ready") {
    return (
      <div className="space-y-4">
        {message && <Notice tone={message.tone} onDismiss={() => setMessage(null)}>{message.text}</Notice>}
        <JobStateNotice job={job} onRerun={rerun} busy={busy === "rerun"} />
      </div>
    );
  }

  async function cover(action: "regenerate" | "branded") {
    setBusy("cover");
    setMessage(null);
    try {
      const updated = await api.newsResearchCover(articleId, action);
      onJob(updated);
      setMessage(action === "branded" ? { tone: "ok", text: "Switched to the branded cover." } : regenerateCoverMessage(updated));
    } catch (e) {
      setMessage({ tone: "error", text: describeError(e, DRAFT_ERRORS, "We couldn't change the cover. Try again.") });
    } finally {
      setBusy("");
    }
  }

  function validate(): boolean {
    const e: typeof errors = {};
    if (!title.trim() || title.trim().length > TITLE_MAX) e.title = DRAFT_ERRORS.invalid_title;
    if (!summary.trim() || summary.trim().length > SUMMARY_MAX) e.summary = DRAFT_ERRORS.invalid_summary;
    if (!body.trim()) e.body = "The body can't be empty.";
    else if (bad.length) e.body = `Marker${bad.length > 1 ? "s" : ""} ${bad.map((n) => `[${n}]`).join(", ")} point${bad.length > 1 ? "" : "s"} past the ${sources.length} sources.`;
    if (!required.every((c) => checks[c.key])) e.checklist = "Tick every item that holds. If one doesn't, edit the draft or reject it.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function approve() {
    if (!validate()) return;
    setBusy("approve");
    setMessage(null);
    try {
      const article = await api.newsResearchApprove(articleId, { title: title.trim(), summary: summary.trim(), body, cover: "keep", checklist: checks });
      onApproved(article);
      onJob({ ...job, status: "approved", reviewedAt: article.reviewedAt, reviewedByName: article.reviewedByName });
    } catch (e) {
      const code = errorCode(e);
      if (code === "invalid_title") setErrors({ title: DRAFT_ERRORS.invalid_title });
      else if (code === "invalid_summary") setErrors({ summary: DRAFT_ERRORS.invalid_summary });
      else if (code === "invalid_markers") setErrors({ body: DRAFT_ERRORS.invalid_markers });
      else if (code === "checklist_incomplete") setErrors({ checklist: `${DRAFT_ERRORS.checklist_incomplete}${errorField(e) ? ` (${errorField(e)})` : ""}` });
      setMessage({ tone: "error", text: describeError(e, DRAFT_ERRORS, "We couldn't publish the report. Try again.") });
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-5">
      {political && (
        <div role="note" className="flex items-start gap-3 rounded-[var(--radius-card)] border border-clay/30 bg-clay/[0.08] px-4 py-3">
          <span aria-hidden className="mt-1 h-2.5 w-2.5 shrink-0 rounded-[2px] bg-clay" />
          <div>
            <p className="text-sm font-semibold text-clay-text">Election coverage: check balance</p>
            <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">This report is political. Make sure every side named has a fair hearing and every claim is attributed. It publishes with the election-coverage label.</p>
          </div>
        </div>
      )}
      {message && <Notice tone={message.tone} onDismiss={() => setMessage(null)}>{message.text}</Notice>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <section aria-label="Draft" className="min-w-0 self-start overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)]">
          <div className="space-y-3 border-b border-sand p-5">
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor="draft-title" className={labelCls}>Headline</label>
                <span className={`text-[0.7rem] tabular-nums ${title.length > TITLE_MAX ? "text-clay-text" : "text-ink-faint"}`}>{title.length}/{TITLE_MAX}</span>
              </div>
              <input id="draft-title" value={title} onChange={(e) => { setTitle(e.target.value); setErrors((er) => ({ ...er, title: undefined })); }} aria-invalid={Boolean(errors.title) || undefined}
                className={`${inputCls} text-xl font-semibold tracking-[-0.01em]`} />
              <FieldError>{errors.title}</FieldError>
            </div>
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor="draft-summary" className={labelCls}>Summary</label>
                <span className={`text-[0.7rem] tabular-nums ${summary.length > SUMMARY_MAX ? "text-clay-text" : "text-ink-faint"}`}>{summary.length}/{SUMMARY_MAX}</span>
              </div>
              <textarea id="draft-summary" value={summary} onChange={(e) => { setSummary(e.target.value); setErrors((er) => ({ ...er, summary: undefined })); }} rows={2} aria-invalid={Boolean(errors.summary) || undefined} className={inputCls} />
              <FieldError>{errors.summary}</FieldError>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 border-b border-sand px-5 py-3">
            <div className="inline-flex rounded-full border border-sand bg-paper p-0.5">
              {(["preview", "write"] as const).map((m) => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={segmentCls(mode === m)}>{m === "write" ? "Edit" : "Read"}</button>
              ))}
            </div>
            <span className="text-[0.7rem] tabular-nums text-ink-faint">{liveWords} words</span>
          </div>
          {mode === "write" ? (
            <div className="p-5">
              <label htmlFor="draft-body" className="sr-only">Report body</label>
              <textarea id="draft-body" value={body} onChange={(e) => { setBody(e.target.value); setErrors((er) => ({ ...er, body: undefined })); }} rows={20}
                aria-invalid={Boolean(errors.body) || undefined} className={`${inputCls} font-mono leading-relaxed`} />
              <p className="mt-1 text-xs text-ink-faint">Keep the [n] markers next to the facts they support. They number the sources below.</p>
              <FieldError>{errors.body}</FieldError>
            </div>
          ) : (
            <article className="px-5 py-6">
              <div className="max-w-[65ch] text-[0.95rem] [&_p]:[text-wrap:pretty]">
                <Markdown citations allowImages={false}>{linkCitations(body)}</Markdown>
              </div>
              <FieldError>{errors.body}</FieldError>
            </article>
          )}
          <div className="border-t border-sand bg-paper/60 px-5 py-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink-faint">Sources</h3>
            <SourceList sources={sources} />
          </div>
        </section>

        <aside className="min-w-0 space-y-5">
          <Panel title="Quality">
            <div className="flex flex-wrap gap-1">
              {draft.flags.length === 0 && <span className="text-sm text-ink-muted">No flags.</span>}
              {draft.flags.map((f) => <FlagChip key={f} tone={f === "political" ? "clay" : "gold"}>{draftFlagLabel(f)}</FlagChip>)}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div><dt className="text-xs text-ink-faint">Citation coverage</dt><dd className="font-semibold tabular-nums text-ink">{percent(draft.citationCoverage, 0)}</dd></div>
              <div><dt className="text-xs text-ink-faint">Words</dt><dd className="font-semibold tabular-nums text-ink">{draft.wordCount}{body !== draft.body ? <span className="font-normal text-ink-faint"> → {liveWords} after edits</span> : null}</dd></div>
              <div><dt className="text-xs text-ink-faint">Sources</dt><dd className="font-semibold tabular-nums text-ink">{sources.length}</dd></div>
              <div><dt className="text-xs text-ink-faint">Cost</dt><dd className="font-semibold tabular-nums text-ink">{usd(jobCost(job))}</dd></div>
              <div className="col-span-2"><dt className="text-xs text-ink-faint">Model</dt><dd className="break-words font-mono text-xs text-ink">{job.model ?? "—"}{job.fallbackUsed ? " (fallback)" : ""}</dd></div>
            </dl>
            {draft.uncitedClaims.length > 0 && (
              <div className="mt-4 border-t border-sand pt-3">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-gold-text">Uncited claims to check</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm leading-relaxed text-ink-muted">
                  {draft.uncitedClaims.map((c) => <li key={c}>{c}</li>)}
                </ul>
              </div>
            )}
          </Panel>

          <Panel title="Cover">
            <CoverPreview draft={draft} title={title} />
            {draft.cover.prompt && (
              <details className="group mt-3 rounded-lg border border-sand bg-paper px-3 py-2 text-sm">
                <summary className="cursor-pointer list-none font-medium text-ink-muted transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
                  <span className="inline-block transition-transform group-open:rotate-90" aria-hidden>›</span> Image prompt
                </summary>
                <p className="mt-2 whitespace-pre-wrap font-mono text-xs leading-relaxed text-ink-muted">{draft.cover.prompt}</p>
              </details>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => cover("regenerate")} disabled={busy !== ""} className={`${btnSecondary} ${btnSmall}`}>
                {busy === "cover" ? <BusyLabel label="Updating the cover" width="w-12" /> : "Regenerate image"}
              </button>
              {aiCover && <button type="button" onClick={() => cover("branded")} disabled={busy !== ""} className={`${btnSecondary} ${btnSmall}`}>Use branded cover</button>}
            </div>
          </Panel>

          <Panel title="Before you publish">
            <fieldset>
              <legend className="sr-only">Editor checklist</legend>
              <ul className="space-y-1">
                {required.map((c) => (
                  <li key={c.key}>
                    <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-paper">
                      <input type="checkbox" checked={checks[c.key]} onChange={(e) => { setChecks((cur) => ({ ...cur, [c.key]: e.target.checked })); setErrors((er) => ({ ...er, checklist: undefined })); }} className="mt-0.5 size-4 shrink-0 accent-green" />
                      <span className="text-sm leading-snug text-ink">{c.label}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
            <FieldError>{errors.checklist}</FieldError>
            <button type="button" onClick={approve} disabled={busy !== ""} className={`${btnPrimary} mt-3 w-full`}>
              {busy === "approve" ? <BusyLabel label="Publishing the report" tone="dark" /> : "Approve and publish"}
            </button>
            <p className="mt-2 text-xs leading-relaxed text-ink-faint">Replaces the brief under the same link, adds the AI-assisted label with your name, and sends no push notification.</p>
            <div className="mt-3 border-t border-sand pt-3">
              <ReasonAction
                label="Reject"
                confirmLabel="Reject draft"
                placeholder="What's wrong with it, for the record"
                description="The brief stays as it is."
                maxLength={500}
                buttonClass={`${btnDangerOutline} w-full`}
                confirmClass={btnDanger}
                busyLabel="Rejecting the draft"
                onConfirm={async (reason) => {
                  try {
                    onJob(await api.newsResearchReject(articleId, reason));
                  } catch (e) {
                    throw new Error(describeError(e, DRAFT_ERRORS, "We couldn't reject the draft. Try again."), { cause: e });
                  }
                }}
              />
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
