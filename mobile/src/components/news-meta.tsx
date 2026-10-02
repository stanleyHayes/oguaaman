import { useMemo } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { T as Text } from "@/components/typography";
import { ArrowUpRightIcon, SparkleIcon } from "@/components/icons";
import { useTheme } from "@/lib/theme-context";
import type { NewsArticle, NewsCorrection, NewsSource } from "@/lib/types";
import { openInAppBrowser } from "@/lib/webbrowser";
import { S, withAlpha, type Palette } from "@/theme";

// Newsroom labels and lists shared by the news list and the article screen
// (spec §2.8, §8): AI chips in the reserved AI purple, the exact hero caption
// and byline copy, a footnote-style numbered source list and dated corrections.

/** Card chip on an AI cover (exact copy, spec §2.8). */
export const AI_ILLUSTRATION = "AI illustration";
/** Article hero caption under an AI cover (exact copy, spec §2.8). */
export const AI_CAPTION = "AI illustration generated with OpenAI for Oguaa. It does not show the real people, place or event.";
export const AI_ASSISTED = "AI-assisted";

export const isReport = (a: Pick<NewsArticle, "tier">) => a.tier === "report";
export const hasAiCover = (a: Pick<NewsArticle, "coverImageKind">) => a.coverImageKind === "ai";

/** "2 October 2026" in the reader's locale; the raw value if it doesn't parse. */
export function longDate(raw?: string): string {
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

/** The byline for a researched report: "Oguaa Desk · AI-assisted · Reviewed by {name}". */
export function reportByline(a: Pick<NewsArticle, "reviewedByName">): string {
  const reviewer = a.reviewedByName?.trim();
  return reviewer ? `Oguaa Desk · ${AI_ASSISTED} · Reviewed by ${reviewer}` : `Oguaa Desk · ${AI_ASSISTED}`;
}

/** A small AI-purple chip. `overlay` sits on a cover image corner. */
export function AiChip({ label, overlay = false, style }: Readonly<{ label: string; overlay?: boolean; style?: StyleProp<ViewStyle> }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={[s.chip, overlay && s.chipOverlay, style]} accessibilityRole="text" accessibilityLabel={label}>
      <SparkleIcon size={overlay ? 10 : 11} color={C.ai} strokeWidth={2.2} />
      <Text style={[s.chipText, overlay && s.chipTextOverlay]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** One numbered source. Only https links open; anything else stays plain text. */
function SourceLink({ source, n }: Readonly<{ source: NewsSource; n: number }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const url = source.url?.startsWith("https://") ? source.url : "";
  const detail = [source.title ? `“${source.title}”` : "", source.author ? `by ${source.author}` : ""].filter(Boolean).join(" · ");
  const content = (
    <>
      <Text style={s.sourceNum}>{n}</Text>
      <View style={s.sourceCopy}>
        <Text style={s.sourceName}>{source.name}</Text>
        {detail ? <Text style={s.sourceDetail}>{detail}</Text> : null}
        {source.original ? <Text style={s.original}>Original report</Text> : null}
      </View>
      {url ? <ArrowUpRightIcon size={14} color={C.inkFaint} strokeWidth={2} /> : null}
    </>
  );
  if (!url) return <View style={s.sourceRow}>{content}</View>;
  const label = `Source ${n}: ${source.name}${source.title ? `, ${source.title}` : ""}${source.original ? ". Original report" : ""}`;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint="Opens the source in the in-app browser"
      onPress={() => { void openInAppBrowser(url); }}
      style={({ pressed }) => [s.sourceRow, pressed && s.sourcePressed]}
    >
      {content}
    </Pressable>
  );
}

/** The numbered, footnote-style source list under a report (matches the [n] markers). */
export function NewsSources({ sources }: Readonly<{ sources: readonly NewsSource[] }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  if (sources.length === 0) return null;
  return (
    <View style={s.block} accessibilityRole="list">
      <Text style={s.blockTitle} accessibilityRole="header">Sources</Text>
      {sources.map((src, i) => <SourceLink key={`${src.url}-${i}`} source={src} n={i + 1} />)}
    </View>
  );
}

/** Dated corrections, newest last, shown above the body. */
export function NewsCorrections({ corrections }: Readonly<{ corrections: readonly NewsCorrection[] }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  if (corrections.length === 0) return null;
  return (
    <View style={s.corrections}>
      <Text style={s.correctionsTitle} accessibilityRole="header">{corrections.length === 1 ? "Correction" : "Corrections"}</Text>
      {corrections.map((c, i) => (
        <View key={`${c.at}-${i}`} style={s.correction}>
          <Text style={s.correctionDate}>{longDate(c.at)}</Text>
          <Text style={s.correctionNote}>{c.note}</Text>
        </View>
      ))}
    </View>
  );
}

/** How a report was made, in our words, when the server sends no label for it. */
function fallbackNote(count: number, reviewer: string | undefined): string {
  const from = count > 0 ? ` from ${count} published ${count === 1 ? "source" : "sources"}` : "";
  const checked = reviewer ? `, then reviewed by ${reviewer}, an Oguaa editor, before publishing` : ", then reviewed by an Oguaa editor before publishing";
  return `Oguaa Desk drafted this report with AI${from}${checked}.`;
}

/**
 * The quiet AI note at the top of a report: how it was made and who checked
 * it. It uses the article's own automation label (as the portal and the
 * website do) and falls back to our wording when there is none.
 */
export function ReportNote({ article }: Readonly<{ article: Pick<NewsArticle, "sources" | "reviewedByName" | "automationLabel"> }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const count = article.sources?.length ?? 0;
  const note = article.automationLabel?.trim() || fallbackNote(count, article.reviewedByName?.trim());
  return (
    <View style={s.note}>
      <View style={s.noteHead}>
        <AiChip label={AI_ASSISTED} />
        <Text style={s.noteTitle}>How this report was made</Text>
      </View>
      <Text style={s.noteText}>
        {note}{count > 0 ? " Numbers in brackets point to the sources listed under the story." : ""}
      </Text>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  chip: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 4, backgroundColor: C.aiTint, borderWidth: 1, borderColor: C.aiLine, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  chipOverlay: { position: "absolute", left: 8, bottom: 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  chipText: { color: C.ai, fontSize: 11, letterSpacing: 0.2, ...S(600) },
  chipTextOverlay: { fontSize: 10.5 },

  block: { marginTop: 4 },
  blockTitle: { color: C.ink, fontSize: 15, letterSpacing: -0.1, marginBottom: 4, ...S(700) },
  sourceRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, minHeight: 44, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.sand },
  sourcePressed: { opacity: 0.7, transform: [{ translateY: 1 }] },
  sourceNum: { width: 18, color: C.goldText, fontSize: 13, lineHeight: 19, textAlign: "right", fontVariant: ["tabular-nums"], ...S(600) },
  sourceCopy: { flex: 1, minWidth: 0, gap: 2 },
  sourceName: { color: C.ink, fontSize: 14, lineHeight: 19, ...S(600) },
  sourceDetail: { color: C.inkMuted, fontSize: 13, lineHeight: 18, ...S(400) },
  original: { color: C.goldText, fontSize: 11, letterSpacing: 0.3, marginTop: 2, ...S(600) },

  // A tinted box, as on the web: clay hairline and wash, never a side tab.
  corrections: { gap: 8, backgroundColor: C.clayTint, borderWidth: 1, borderColor: withAlpha(C.clay, 0.25), borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14 },
  correctionsTitle: { color: C.ink, fontSize: 14, letterSpacing: -0.1, ...S(600) },
  correction: { gap: 2 },
  correctionDate: { color: C.ink, fontSize: 12.5, fontVariant: ["tabular-nums"], ...S(500) },
  correctionNote: { color: C.inkMuted, fontSize: 14, lineHeight: 20, ...S(400) },

  noteHead: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  noteTitle: { color: C.ink, fontSize: 13.5, letterSpacing: -0.1, ...S(600) },
  note: { gap: 6, backgroundColor: C.aiTint, borderWidth: 1, borderColor: C.aiLine, borderRadius: 12, padding: 14 },
  noteText: { color: C.inkMuted, fontSize: 13.5, lineHeight: 20, ...S(400) },
});
