// Display rules for automated news (spec sections 2.8 and 2.9). The copy here
// is exact: change it only together with the spec and the other clients.
import type { NewsArticle, NewsSource } from "./api";

/** Hero caption under an AI cover. */
export const AI_COVER_CAPTION =
  "AI illustration generated with OpenAI for Oguaa. It does not show the real people, place or event.";

/** Shown when a report has no public reviewer name (spec assumption A11). */
const FALLBACK_REVIEWER = "Oguaa editor";

export const isReport = (a: Pick<NewsArticle, "tier">): boolean => a.tier === "report";

/** Only an AI cover that actually has an image gets the AI chip and caption. */
export const isAiCover = (a: Pick<NewsArticle, "coverImageKind" | "coverImageUrl">): boolean =>
  a.coverImageKind === "ai" && Boolean(a.coverImageUrl);

export function reviewerName(a: Pick<NewsArticle, "reviewedByName">): string {
  return a.reviewedByName?.trim() || FALLBACK_REVIEWER;
}

/** The byline for an AI-assisted report: "Oguaa Desk · AI-assisted · Reviewed by {name}". */
export function reportByline(a: Pick<NewsArticle, "reviewedByName">): string {
  return `Oguaa Desk · AI-assisted · Reviewed by ${reviewerName(a)}`;
}

/** Short byline for list cards. */
export function cardByline(a: NewsArticle): string {
  return isReport(a) ? `Oguaa Desk · reviewed by ${reviewerName(a)}` : `By ${a.authorName}`;
}

/** Alt text for the hero cover. Branded covers describe themselves without an AI label. */
export function coverAlt(a: NewsArticle): string {
  if (a.coverImageAlt?.trim()) return a.coverImageAlt;
  if (a.coverImageKind === "branded") return `Oguaa Newsroom graphic: ${a.title}`;
  return "";
}

/** A source or original link is only ever rendered when it is https. */
export function safeHttps(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}

export const sourceAnchor = (n: number): string => `source-${n}`;

/**
 * Turn the body's `[n]` citation markers into links to the numbered source
 * list. Markers outside 1..count (and real Markdown links such as `[1](…)`)
 * are left as written. Adjacent markers such as `[1][3]` both link.
 */
export function linkCitations(body: string, sources: readonly NewsSource[] | undefined): string {
  const count = sources?.length ?? 0;
  if (count === 0) return body;
  return body.replace(/\[(\d{1,2})\](?![(:])/g, (marker, digits: string) => {
    const n = Number(digits);
    return n >= 1 && n <= count ? `[${n}](#${sourceAnchor(n)})` : marker;
  });
}

/** "2026-10-02T…" → "2 Oct 2026", on Cape Coast's calendar (Africa/Accra). */
export function newsDate(iso?: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Accra" });
}
