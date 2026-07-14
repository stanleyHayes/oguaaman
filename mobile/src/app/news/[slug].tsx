import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { NewsArticle } from "@/lib/types";
import { C, serif } from "@/theme";
import { Loading, ErrorView, Markdown } from "@/ui";
import { cldCover } from "@/lib/cloudinary";

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
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "Not found"} />;

  return (
    <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 48 }}>
      <View style={s.hero}>
        {data.coverImageUrl ? (
          <Image source={{ uri: cldCover(data.coverImageUrl, 800) }} resizeMode="cover" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: data.coverColor ?? "#123F2D" }]} />
        )}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(12,44,31,0.68)" }]} />
        <View style={s.heroInner}>
          <Text style={s.kicker}>The Oguaa Newsroom</Text>
          <Text style={s.title}>{data.title}</Text>
          <View style={s.bylineRow}>
            <View style={s.bylineDot} />
            <Text style={s.byline}>By {data.authorName} · {newsDate(data)}</Text>
          </View>
        </View>
      </View>

      <View style={s.body}>
        {data.summary ? <Text style={s.summary}>{data.summary}</Text> : null}
        <View style={s.divider} />
        <Markdown>{data.body}</Markdown>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  hero: { minHeight: 260, justifyContent: "flex-end" },
  heroInner: { padding: 20, paddingBottom: 24 },
  kicker: { color: C.gold, fontSize: 10, letterSpacing: 2, fontWeight: "700", textTransform: "uppercase" },
  title: { color: C.cream, fontFamily: serif, fontSize: 30, fontWeight: "700", lineHeight: 38, marginTop: 8 },
  bylineRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 },
  bylineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.gold },
  byline: { color: "rgba(246,241,231,0.85)", fontSize: 13 },
  body: { padding: 20 },
  summary: { fontFamily: serif, fontStyle: "italic", fontSize: 18, lineHeight: 27, color: C.inkMuted },
  divider: { height: 1, backgroundColor: C.sand, marginVertical: 20 },
});
