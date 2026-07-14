import { Image, ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import { Link } from "expo-router";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { NewsArticle } from "@/lib/types";
import { C, serif } from "@/theme";
import { Loading, ErrorView } from "@/ui";
import { cldCover } from "@/lib/cloudinary";

function newsDate(a: NewsArticle): string {
  const raw = a.publishedAt ?? a.createdAt;
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export default function News() {
  const { data, error, loading } = useApi<NewsArticle[]>(() => api.news(), "news");
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "No data"} />;

  return (
    <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}>
      <Text style={s.lede}>Festivals, scholarships, homecomings and notices from Cape Coast.</Text>
      {data.length === 0 && (
        <Text style={s.empty}>No stories yet — the newsroom is just getting started.</Text>
      )}
      {data.map((a) => (
        <Link key={a.id} href={`/news/${a.slug}`} asChild>
          <Pressable style={s.card}>
            {a.coverImageUrl
              ? <Image source={{ uri: cldCover(a.coverImageUrl, 500) }} resizeMode="cover" style={s.cover} />
              : <View style={[s.strip, { backgroundColor: a.coverColor ?? "#123F2D" }]} />}
            <View style={s.cardBody}>
              <Text style={s.title}>{a.title}</Text>
              {a.summary ? <Text style={s.summary} numberOfLines={3}>{a.summary}</Text> : null}
              <Text style={s.byline}>{a.authorName} · {newsDate(a)}</Text>
            </View>
          </Pressable>
        </Link>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  lede: { color: C.inkMuted, fontSize: 14, lineHeight: 20 },
  empty: { color: C.inkFaint, fontStyle: "italic", textAlign: "center", marginTop: 20 },
  card: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 14, overflow: "hidden" },
  strip: { height: 8 },
  cover: { width: "100%", height: 150, backgroundColor: C.sand },
  cardBody: { padding: 14 },
  title: { fontFamily: serif, fontSize: 20, fontWeight: "700", color: C.ink },
  summary: { color: C.inkMuted, fontSize: 14, lineHeight: 20, marginTop: 6 },
  byline: { color: C.goldText, fontSize: 12, marginTop: 10 },
});
