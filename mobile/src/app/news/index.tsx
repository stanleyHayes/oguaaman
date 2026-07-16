import { useMemo } from "react";
import { Image, ScrollView, StyleSheet, View, Pressable } from "react-native";
import { Link } from "expo-router";
import { T as Text } from "@/components/typography";
import { api, mediaUrl } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { NewsArticle } from "@/lib/types";
import { D, S, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { Loading, ErrorView, VerifiedBadge } from "@/ui";
import { cldCover } from "@/lib/cloudinary";
import { RevealView, StaggerIn } from "@/components/anim";
import { EmptyState } from "@/components/empty-state";

function newsDate(a: NewsArticle): string {
  const raw = a.publishedAt ?? a.createdAt;
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function Cover({ article: a, height }: Readonly<{ article: NewsArticle; height: number }>) {
  const { C } = useTheme();
  if (a.coverImageUrl) {
    return <Image source={{ uri: cldCover(mediaUrl(a.coverImageUrl), 600) }} resizeMode="cover" style={{ width: "100%", height, backgroundColor: C.sand }} />;
  }
  return <View style={{ width: "100%", height: Math.max(10, height * 0.35), backgroundColor: a.coverColor ?? C.green }} />;
}

export default function News() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { data, error, loading } = useApi<NewsArticle[]>(() => api.news(), "news");
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "No data"} />;

  const [featured, ...rest] = data;

  return (
    <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 40 }}>
      <RevealView style={s.hero}>
        <Text style={s.heroKicker}>The Oguaa Newsroom</Text>
        <Text style={s.heroTitle}>Stories from the town</Text>
        <Text style={s.heroLede}>Festivals, scholarships, homecomings and notices from Cape Coast.</Text>
      </RevealView>

      <View style={{ padding: 16, gap: 14 }}>
        {data.length === 0 && (
          <EmptyState glyph="✉" title="No stories yet" body="The newsroom is just getting started." />
        )}

        {featured && (
          <StaggerIn index={0}>
            <Link href={`/news/${featured.slug}`} asChild>
              <Pressable style={s.featured}>
                <Cover article={featured} height={190} />
                <View style={s.featuredBody}>
                  <Text style={s.featuredKicker}>Featured story</Text>
                  <Text style={s.featuredTitle}>{featured.title}</Text>
                  {featured.summary ? <Text style={s.summary} numberOfLines={3}>{featured.summary}</Text> : null}
                  <View style={s.bylineRow}>
                    <Text style={s.byline}>{featured.authorName} · {newsDate(featured)}</Text>
                    {featured.authorVerified ? <VerifiedBadge size={13} /> : null}
                  </View>
                  <Text style={s.readMore}>Read story ↗</Text>
                </View>
              </Pressable>
            </Link>
          </StaggerIn>
        )}

        {rest.map((a, i) => (
          <StaggerIn key={a.id} index={i + 1}>
            <Link href={`/news/${a.slug}`} asChild>
              <Pressable style={s.card}>
                <Cover article={a} height={130} />
                <View style={s.cardBody}>
                  <Text style={s.title}>{a.title}</Text>
                  {a.summary ? <Text style={s.summary} numberOfLines={2}>{a.summary}</Text> : null}
                  <View style={s.bylineRow}>
                    <Text style={s.byline}>{a.authorName} · {newsDate(a)}</Text>
                    {a.authorVerified ? <VerifiedBadge size={13} /> : null}
                  </View>
                  <Text style={s.readMore}>Read story ↗</Text>
                </View>
              </Pressable>
            </Link>
          </StaggerIn>
        ))}
      </View>
    </ScrollView>
  );
}

// On-dark text at a bespoke alpha (no palette token at this opacity): re-alpha
// the palette's on-dark text base so light mode stays pixel-identical
// (cream-based) and dark mode keeps light-on-dark text (dark-ink-based).
const onDarkText = (C: Palette, alpha: number) => C.onDarkText85.replace(/[^,]+\)$/, `${alpha})`);

const makeStyles = (C: Palette) => StyleSheet.create({
  hero: { backgroundColor: C.green, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 26, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  heroKicker: { color: C.gold, fontSize: 10, letterSpacing: 2, fontWeight: "700", textTransform: "uppercase" },
  heroTitle: { color: C.cream, ...D(700), fontSize: 30, marginTop: 6 },
  heroLede: { color: onDarkText(C, 0.8), fontSize: 14, lineHeight: 20, marginTop: 6 },
  // shadowColor stays pure black — shadows are theme-independent.
  featured: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 16, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  featuredBody: { padding: 16 },
  featuredKicker: { color: C.goldText, fontSize: 10, letterSpacing: 2, fontWeight: "700", textTransform: "uppercase" },
  featuredTitle: { ...S(700), fontSize: 24, color: C.ink, lineHeight: 30, marginTop: 6 },
  card: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 14, overflow: "hidden" },
  cardBody: { padding: 14 },
  title: { ...S(700), fontSize: 19, color: C.ink, lineHeight: 25 },
  summary: { color: C.inkMuted, fontSize: 14, lineHeight: 20, marginTop: 6 },
  bylineRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" },
  byline: { color: C.inkFaint, fontSize: 12 },
  readMore: { color: C.green, fontSize: 13, fontWeight: "700", marginTop: 10 },
});
