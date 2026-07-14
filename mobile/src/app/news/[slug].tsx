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
      {data.coverImageUrl
        ? <Image source={{ uri: cldCover(data.coverImageUrl, 700) }} resizeMode="cover" style={s.cover} />
        : <View style={[s.strip, { backgroundColor: data.coverColor ?? "#123F2D" }]} />}
      <View style={s.body}>
        <Text style={s.title}>{data.title}</Text>
        {data.summary ? <Text style={s.summary}>{data.summary}</Text> : null}
        <Text style={s.byline}>By {data.authorName} · {newsDate(data)}</Text>
        <View style={s.divider} />
        <Markdown>{data.body}</Markdown>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  strip: { height: 10 },
  cover: { width: "100%", height: 220, backgroundColor: C.sand },
  body: { padding: 20 },
  title: { fontFamily: serif, fontSize: 30, fontWeight: "700", color: C.ink, lineHeight: 38 },
  summary: { fontFamily: serif, fontStyle: "italic", fontSize: 17, lineHeight: 25, color: C.inkMuted, marginTop: 10 },
  byline: { color: C.goldText, fontSize: 13, marginTop: 12 },
  divider: { height: 1, backgroundColor: C.sand, marginVertical: 20 },
});
