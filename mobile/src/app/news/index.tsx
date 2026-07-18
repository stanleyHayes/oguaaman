import { route } from "@/lib/routes";
import { useMemo } from "react";
import { FlatList, Image, RefreshControl, StyleSheet, View, Pressable } from "react-native";
import { Link } from "expo-router";
import { T as Text } from "@/components/typography";
import { api, mediaUrl } from "@/lib/api";
import { usePaginatedList } from "@/lib/use-paginated";
import type { NewsArticle } from "@/lib/types";
import { D, S, ON_GREEN, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { Loading, ErrorView, VerifiedBadge } from "@/ui";
import { cldCover } from "@/lib/cloudinary";
import { RevealView, StaggerIn } from "@/components/anim";
import { EmptyState } from "@/components/empty-state";
import { EnvelopeIcon } from "@/components/icons";
import { ListFooter } from "@/components/list-footer";

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
  const { items, total, loading, loadingMore, refreshing, error, hasMore, loadMore, refresh } =
    usePaginatedList<NewsArticle>((page, pageSize) => api.news({ page, pageSize }), "news");

  if (loading) return <Loading />;
  if (error && items.length === 0) return <ErrorView message={error} />;

  // The newest story leads in a large featured card; the rest scroll below and
  // paginate in via onEndReached.
  const [featured, ...rest] = items;

  const header = (
    <>
      <RevealView style={s.hero}>
        <Text style={s.heroKicker}>The Oguaa Newsroom</Text>
        <Text style={s.heroTitle}>Stories from the town</Text>
        <Text style={s.heroLede}>Festivals, scholarships, homecomings and notices from Cape Coast.</Text>
      </RevealView>

      {items.length === 0 ? (
        <View style={s.pad}>
          <EmptyState icon={<EnvelopeIcon size={56} color={C.inkFaint} strokeWidth={1.5} />} title="No stories yet" body="The newsroom is just getting started." />
        </View>
      ) : null}

      {featured ? (
        <View style={[s.pad, { paddingTop: 14 }]}>
          <StaggerIn index={0}>
            <Link href={route.newsArticle(featured.slug)} asChild>
              <Pressable style={s.featured} accessibilityRole="button" accessibilityLabel={featured.title}>
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
        </View>
      ) : null}
    </>
  );

  return (
    <FlatList<NewsArticle>
      style={{ backgroundColor: C.paper }}
      contentContainerStyle={{ paddingBottom: 40 }}
      data={rest}
      keyExtractor={(a) => a.id}
      ListHeaderComponent={header}
      onEndReached={() => loadMore()}
      onEndReachedThreshold={0.5}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.greenText} colors={[C.greenText]} />}
      renderItem={({ item: a, index }) => (
        <View style={[s.pad, { paddingTop: 14 }]}>
          <StaggerIn index={index + 1}>
            <Link href={route.newsArticle(a.slug)} asChild>
              <Pressable style={s.card} accessibilityRole="button" accessibilityLabel={a.title}>
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
        </View>
      )}
      ListFooterComponent={
        <ListFooter
          loadingMore={loadingMore}
          hasMore={hasMore}
          onLoadMore={loadMore}
          endLabel={!hasMore && total > 0 ? `${total} ${total === 1 ? "story" : "stories"}` : undefined}
        />
      }
    />
  );
}

// On-dark text at a bespoke alpha (no palette token at this opacity): re-alpha
// the palette's on-dark text base so light mode stays pixel-identical
// (cream-based) and dark mode keeps light-on-dark text (dark-ink-based).
const onDarkText = (C: Palette, alpha: number) => C.onDarkText85.replace(/[^,]+\)$/, `${alpha})`);

const makeStyles = (C: Palette) => StyleSheet.create({
  pad: { paddingHorizontal: 16 },
  hero: { backgroundColor: C.green, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 26, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  heroKicker: { color: C.gold, fontSize: 10, letterSpacing: 2, ...D(700), textTransform: "uppercase" },
  heroTitle: { color: ON_GREEN, ...D(700), fontSize: 30, marginTop: 6 },
  heroLede: { color: onDarkText(C, 0.8), fontSize: 14, lineHeight: 20, marginTop: 6 },
  // shadowColor stays pure black — shadows are theme-independent.
  featured: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 16, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  featuredBody: { padding: 16 },
  featuredKicker: { color: C.goldText, fontSize: 10, letterSpacing: 2, ...D(700), textTransform: "uppercase" },
  featuredTitle: { ...S(700), fontSize: 24, color: C.ink, lineHeight: 30, marginTop: 6 },
  card: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 14, overflow: "hidden" },
  cardBody: { padding: 14 },
  title: { ...S(700), fontSize: 19, color: C.ink, lineHeight: 25 },
  summary: { color: C.inkMuted, fontSize: 14, lineHeight: 20, marginTop: 6 },
  bylineRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" },
  byline: { color: C.inkFaint, fontSize: 12 },
  readMore: { color: C.greenText, fontSize: 13, ...S(700), marginTop: 10 },
});
