import { useMemo } from "react";
import { Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { T as Text } from "@/components/typography";
import { api, mediaUrl } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useTheme } from "@/lib/theme-context";
import type { NewsArticle } from "@/lib/types";
import { D, SI, ON_GREEN, withAlpha, type Palette } from "@/theme";
import { Loading, ErrorView, Markdown, VerifiedBadge } from "@/ui";
import { cldCover } from "@/lib/cloudinary";
import { RevealView } from "@/components/anim";
import { openInAppBrowser } from "@/lib/webbrowser";
import { ReportButton } from "@/report-button";
import { AdCard } from "@/components/ad-card";
import { AI_CAPTION, AI_ILLUSTRATION, AiChip, NewsCorrections, NewsSources, ReportNote, hasAiCover, isReport, longDate, reportByline } from "@/components/news-meta";

const NEWSROOM_EMAIL = "hello@oguaaman.com";
const ELECTION_TAG = "Election coverage";

const newsDate = (a: NewsArticle) => longDate(a.publishedAt ?? a.createdAt);

/** Who the hero credits: the desk for reports, the source for briefs, else the author. */
function bylineFor(a: NewsArticle): string {
  if (isReport(a)) return reportByline(a);
  if (a.automated && a.sourceName) return `From ${a.sourceName} · summarised by Oguaa`;
  return `By ${a.authorName}`;
}

export default function Article() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data, error, loading } = useApi<NewsArticle>(() => api.newsArticle(slug), "news:" + slug);
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "Not found"} />;

  const report = isReport(data);
  const aiCover = hasAiCover(data);
  const sources = data.sources ?? [];
  const political = !!data.political || (data.tags ?? []).includes(ELECTION_TAG);

  return (
    <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 48 }}>
      <RevealView style={s.hero}>
        {data.coverImageUrl ? (
          <Image
            source={{ uri: cldCover(mediaUrl(data.coverImageUrl), 800) }}
            resizeMode="cover"
            accessible={!!data.coverImageAlt}
            accessibilityLabel={data.coverImageAlt || undefined}
            style={[StyleSheet.absoluteFill, { backgroundColor: data.coverColor ?? C.green }]}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: data.coverColor ?? C.green }]} />
        )}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(C.green900, 0.68) }]} />
        <View style={s.heroInner}>
          <Text style={s.kicker}>The Oguaa Newsroom</Text>
          <Text style={s.title}>{data.title}</Text>
          {/* Reports carry their label in the AI note below; briefs keep it here. */}
          {data.automated && !report ? <Text style={s.automated}>{data.automationLabel ?? "AUTOMATED REPORT"}</Text> : null}
          <View style={s.bylineRow}>
            <View style={s.bylineDot} />
            <Text style={s.byline}>{bylineFor(data)} · {newsDate(data)}</Text>
            {!report && data.authorVerified ? <VerifiedBadge onDark size={14} /> : null}
          </View>
        </View>
      </RevealView>
      {aiCover && data.coverImageUrl ? (
        <View style={s.caption}>
          <AiChip label={AI_ILLUSTRATION} />
          <Text style={s.captionText}>{AI_CAPTION}</Text>
        </View>
      ) : null}

      <RevealView delay={100} style={s.body}>
        {report ? <ReportNote article={data} /> : null}
        {!report && data.automated && sources.length === 0 ? <SourceLink article={data} s={s} /> : null}
        {data.summary ? <Text style={s.summary}>{data.summary}</Text> : null}
        <NewsCorrections corrections={data.corrections ?? []} />
        <View style={s.divider} />
        <Markdown>{data.body}</Markdown>
        {sources.length > 0 ? (
          <>
            <View style={s.divider} />
            <NewsSources sources={sources} />
          </>
        ) : null}
        <View style={s.divider} />
        <ReportButton target={{ type: "news", id: data.id || data.slug }} />
        <Text style={s.newsroom}>Newsroom contact: {NEWSROOM_EMAIL}. Rights holders can ask us to remove a story at the same address.</Text>
      </RevealView>

      {/* Paid slot, well clear of the story and its controls (renders nothing without an ad). */}
      <AdCard section="news" political={political} style={s.ad} />
    </ScrollView>
  );
}

// The original report for an automated summary: tappable only for https links.
function SourceLink({ article, s }: Readonly<{ article: NewsArticle; s: ReturnType<typeof makeStyles> }>) {
  const name = article.sourceName ?? "a trusted public source";
  const url = article.sourceUrl ?? "";
  if (!url.startsWith("https://")) {
    return <Text style={s.source}>Automated summary from {name}. Verify important details at the original source.</Text>;
  }
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`Read the original at ${name}`} onPress={() => { void openInAppBrowser(url); }} style={s.sourceBox}>
      <Text style={s.sourceText}>Automated summary from {name}. Verify important details at the original source.</Text>
      <Text style={s.sourceLink}>Read the original at {name} ↗</Text>
    </Pressable>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  hero: { minHeight: 260, justifyContent: "flex-end" },
  heroInner: { padding: 20, paddingBottom: 24 },
  kicker: { color: C.gold, fontSize: 10, letterSpacing: 2, ...D(700), textTransform: "uppercase" },
  title: { color: ON_GREEN, ...D(700), fontSize: 30, lineHeight: 38, marginTop: 8 },
  bylineRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 14 },
  bylineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.gold, marginTop: 6 },
  byline: { flexShrink: 1, color: C.onDarkText85, fontSize: 13, lineHeight: 18 },
  automated: { color: C.gold, fontSize: 10, letterSpacing: 1.2, marginTop: 10, ...D(700), textTransform: "uppercase" },
  caption: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 2 },
  captionText: { flex: 1, color: C.inkMuted, fontSize: 12, lineHeight: 17 },
  body: { padding: 20, gap: 16 },
  ad: { paddingHorizontal: 20, paddingTop: 8 },
  source: { color: C.goldText, backgroundColor: withAlpha(C.gold, 0.1), borderRadius: 12, padding: 12, fontSize: 12, lineHeight: 18 },
  sourceBox: { backgroundColor: withAlpha(C.gold, 0.1), borderRadius: 12, padding: 12, gap: 6 },
  sourceText: { color: C.goldText, fontSize: 12, lineHeight: 18 },
  sourceLink: { color: C.tealText, fontSize: 13, textDecorationLine: "underline" },
  newsroom: { color: C.inkFaint, fontSize: 12, lineHeight: 18 },
  summary: { ...SI(), fontSize: 18, lineHeight: 27, color: C.inkMuted },
  divider: { height: 1, backgroundColor: C.sand, marginVertical: 4 },
});
