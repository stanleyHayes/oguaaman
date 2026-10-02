import type { NewsApproveChecklist, NewsResearchJob, ResearchJobStatus } from "./types";
import type { Tone } from "./ads";

export const JOB_STATUS_ORDER: readonly ResearchJobStatus[] = [
  "ready", "queued", "running", "approved", "rejected", "failed", "refused", "no_story", "blocked", "stale",
];

export const JOB_STATUS_LABEL: Record<ResearchJobStatus, string> = {
  queued: "Queued",
  running: "Researching",
  ready: "Ready for review",
  approved: "Published",
  rejected: "Rejected",
  failed: "Failed",
  refused: "Declined by the model",
  no_story: "No story",
  blocked: "Blocked topic",
  stale: "Too old",
};

export const JOB_STATUS_TONE: Record<ResearchJobStatus, Tone> = {
  queued: "neutral",
  running: "teal",
  ready: "gold",
  approved: "green",
  rejected: "maroon",
  failed: "clay",
  refused: "clay",
  no_story: "neutral",
  blocked: "neutral",
  stale: "neutral",
};

/** Soft flags from the quality gates (spec §2.6), in plain words. */
export const DRAFT_FLAG_LABEL: Record<string, string> = {
  low_citation_coverage: "Low citation coverage",
  uncited_claims: "Uncited claims",
  paragraph_without_citation: "Paragraph without a citation",
  political: "Political",
  fallback_model: "Fallback model answered",
};

export function draftFlagLabel(flag: string): string {
  return DRAFT_FLAG_LABEL[flag] ?? flag.replaceAll("_", " ");
}

/** Why the desk used a branded cover instead of an AI illustration. */
export const COVER_SKIP_LABEL: Record<string, string> = {
  political: "Political story: branded covers only",
  sensitive: "Sensitive topic: branded covers only",
  election_mode: "Election mode is on",
  disabled: "AI illustrations are switched off",
  no_key: "No image API key is configured",
  no_cloudinary: "Cloudinary is not configured",
  cap: "Today's image cap was reached",
  scene_rejected: "The scene description failed the safety check",
  moderation_blocked: "The image service declined the prompt",
  error: "The image service failed",
};

/** The same reasons as a clause, for "No illustration was drawn: …". */
const COVER_SKIP_CLAUSE: Record<string, string> = {
  political: "political stories get branded covers only",
  sensitive: "sensitive topics get branded covers only",
  election_mode: "election mode is on",
  disabled: "AI illustrations are switched off",
  no_key: "no image API key is configured",
  no_cloudinary: "Cloudinary is not configured",
  cap: "today's image cap was reached",
  scene_rejected: "the scene description failed the safety check",
  moderation_blocked: "the image service declined the prompt",
  error: "the image service failed",
};

/**
 * What "Regenerate image" achieved, from the job it returned: a new AI
 * illustration, or the branded cover with the reason none was drawn.
 */
export function regenerateCoverMessage(job: NewsResearchJob): { tone: "ok" | "warn"; text: string } {
  const cover = job.draft?.cover;
  if (cover?.kind === "ai") return { tone: "ok", text: "New illustration ready. Check it before publishing." };
  const why = cover?.skippedReason ? COVER_SKIP_CLAUSE[cover.skippedReason] ?? cover.skippedReason.replaceAll("_", " ") : "";
  return { tone: "warn", text: why ? `No illustration was drawn: ${why}. The branded cover is used.` : "No illustration was drawn. The branded cover is used." };
}

export const CHECKLIST_ITEMS: readonly { key: keyof NewsApproveChecklist; label: string; when?: "political" | "ai" }[] = [
  { key: "factsMatchSources", label: "Every fact matches the numbered sources" },
  { key: "noUnattributedAllegations", label: "No unattributed allegations about anyone" },
  { key: "quotesAccurate", label: "Quotes are accurate and attributed" },
  { key: "balancedIfPolitical", label: "Political coverage is balanced", when: "political" },
  { key: "imageCompliant", label: "The AI illustration does not show real people, places or events", when: "ai" },
  { key: "rightOfReplyConsidered", label: "Right of reply was considered" },
];

/** Jobs an editor may send back to the queue (spec §2.9). */
export function canRerun(job: Pick<NewsResearchJob, "status" | "refusalCategory">): boolean {
  if (job.refusalCategory === "reasoning_extraction") return false;
  return ["failed", "rejected", "no_story", "refused"].includes(job.status);
}

/** Total job cost (Claude + image) in micro-USD. */
export function jobCost(job: Pick<NewsResearchJob, "costMicroUsd" | "imageMicroUsd">): number {
  return (job.costMicroUsd ?? 0) + (job.imageMicroUsd ?? 0);
}

/** Converts "[n]" markers to footnote links the Markdown preview renders as superscripts. */
export function linkCitations(body: string): string {
  return body.replaceAll(/\[(\d{1,2})\](?!\()/g, "[$1](#src-$1)");
}

/** Markers in the body that point past the source list (spec: invalid_markers). */
export function badMarkers(body: string, sourceCount: number): number[] {
  const out = new Set<number>();
  for (const m of body.matchAll(/\[(\d{1,3})\](?!\()/g)) {
    const n = Number(m[1]);
    if (n < 1 || n > sourceCount) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}
