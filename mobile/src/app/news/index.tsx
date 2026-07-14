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

function Cover({ article: a, height }: Readonly<{ article: NewsArticle; height: number }>) {
  if (a.coverImageUrl) {
    return <Image source={{ uri: cldCover(a.coverImageUrl, 600) }} resizeMode="cover" style={{ width: "100%", height, backgroundColor: C.sand }} />;
  }
  return <View style={{ width: "100%", height: Math.max(10, height * 0.35), backgroundColor: a.coverColor ?? "#123F2D" }} />;
}

export default function News() {
  const { data, error, loading } = useApi<NewsArticle[]>(() => api.news(), "news");
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "No data"} />;

  const [featured, ...rest] = data;

  return (
    <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={s.hero}>
        <Text style={s.heroKicker}>The Oguaa Newsroom</Text>
        <Text style={s.heroTitle}>Stories from the town</Text>
        <Text style={s.heroLede}>Festivals, scholarships, homecomings and notices from Cape Coast.</Text>
      </View>

      <View style={{ padding: 16, gap: 14 }}>
        {data.length === 0 && (
          <Text style={s.empty}>No stories yet — the newsroom is just getting started.</Text>
        )}

        {featured && (
          <Link href={`/news/${featured.slug}`} asChild>
            <Pressable style={s.featured}>
              <Cover article={featured} height={190} />
              <View style={s.featuredBody}>
                <Text style={s.featuredKicker}>Featured story</Text>
                <Text style={s.featuredTitle}>{featured.title}</Text>
                {featured.summary ? <Text style={s.summary} numberOfLines={3}>{featured.summary}</Text> : null}
                <Text style={s.byline}>{featured.authorName} · {newsDate(featured)}</Text>
                <Text style={s.readMore}>Read story ↗</Text>
              </View>
            </Pressable>
          </Link>
        )}

        {rest.map((a) => (
          <Link key={a.id} href={`/news/${a.slug}`} asChild>
            <Pressable style={s.card}>
              <Cover article={a} height={130} />
              <View style={s.cardBody}>
                <Text style={s.title}>{a.title}</Text>
                {a.summary ? <Text style={s.summary} numberOfLines={2}>{a.summary}</Text> : null}
                <Text style={s.byline}>{a.authorName} · {newsDate(a)}</Text>
                <Text style={s.readMore}>Read story ↗</Text>
              </View>
            </Pressable>
          </Link>
        ))}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  hero: { backgroundColor: C.green, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 26, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  heroKicker: { color: C.gold, fontSize: 10, letterSpacing: 2, fontWeight: "700", textTransform: "uppercase" },
  heroTitle: { color: C.cream, fontFamily: serif, fontSize: 30, fontWeight: "700", marginTop: 6 },
  heroLede: { color: "rgba(246,241,231,0.8)", fontSize: 14, lineHeight: 20, marginTop: 6 },
  empty: { color: C.inkFaint, fontStyle: "italic", textAlign: "center", marginTop: 20 },
  featured: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 16, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  featuredBody: { padding: 16 },
  featuredKicker: { color: C.goldText, fontSize: 10, letterSpacing: 2, fontWeight: "700", textTransform: "uppercase" },
  featuredTitle: { fontFamily: serif, fontSize: 24, fontWeight: "700", color: C.ink, lineHeight: 30, marginTop: 6 },
  card: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 14, overflow: "hidden" },
  cardBody: { padding: 14 },
  title: { fontFamily: serif, fontSize: 19, fontWeight: "700", color: C.ink, lineHeight: 25 },
  summary: { color: C.inkMuted, fontSize: 14, lineHeight: 20, marginTop: 6 },
  byline: { color: C.inkFaint, fontSize: 12, marginTop: 10 },
  readMore: { color: C.green, fontSize: 13, fontWeight: "700", marginTop: 10 },
});
