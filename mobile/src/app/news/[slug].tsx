import { useMemo } from "react";
import { Image, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { T as Text } from "@/components/typography";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useTheme } from "@/lib/theme-context";
import type { NewsArticle } from "@/lib/types";
import { D, SI, ON_GREEN, withAlpha, type Palette } from "@/theme";
import { Loading, ErrorView, Markdown, VerifiedBadge } from "@/ui";
import { cldCover } from "@/lib/cloudinary";
import { RevealView } from "@/components/anim";

function newsDate(a: NewsArticle): string {
  const raw = a.publishedAt ?? a.createdAt;
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export default function Article() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data, error, loading } = useApi<NewsArticle>(() => api.newsArticle(slug), "news:" + slug);
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "Not found"} />;

  return (
    <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 48 }}>
      <RevealView style={s.hero}>
        {data.coverImageUrl ? (
          <Image source={{ uri: cldCover(data.coverImageUrl, 800) }} resizeMode="cover" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: data.coverColor ?? C.green }]} />
        )}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(C.green900, 0.68) }]} />
        <View style={s.heroInner}>
          <Text style={s.kicker}>The Oguaa Newsroom</Text>
          <Text style={s.title}>{data.title}</Text>
          <View style={s.bylineRow}>
            <View style={s.bylineDot} />
            <Text style={s.byline}>By {data.authorName} · {newsDate(data)}</Text>
            {data.authorVerified ? <VerifiedBadge onDark size={14} /> : null}
          </View>
        </View>
      </RevealView>

      <RevealView delay={100} style={s.body}>
        {data.summary ? <Text style={s.summary}>{data.summary}</Text> : null}
        <View style={s.divider} />
        <Markdown>{data.body}</Markdown>
      </RevealView>
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  hero: { minHeight: 260, justifyContent: "flex-end" },
  heroInner: { padding: 20, paddingBottom: 24 },
  kicker: { color: C.gold, fontSize: 10, letterSpacing: 2, ...D(700), textTransform: "uppercase" },
  title: { color: ON_GREEN, ...D(700), fontSize: 30, lineHeight: 38, marginTop: 8 },
  bylineRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 },
  bylineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.gold },
  byline: { color: C.onDarkText85, fontSize: 13 },
  body: { padding: 20 },
  summary: { ...SI(), fontSize: 18, lineHeight: 27, color: C.inkMuted },
  divider: { height: 1, backgroundColor: C.sand, marginVertical: 20 },
});
