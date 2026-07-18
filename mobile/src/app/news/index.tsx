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
import { ArrowRightIcon, EnvelopeIcon } from "@/components/icons";
import { ListFooter } from "@/components/list-footer";

function newsDate(a: NewsArticle): string {
  const raw = a.publishedAt ?? a.createdAt;
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function Cover({ article: a, height, compact = false }: Readonly<{ article: NewsArticle; height: number; compact?: boolean }>) {
  const { C } = useTheme();
  const dimensions = { width: compact ? 108 : "100%" as const, height };
  if (a.coverImageUrl) {
    return <Image source={{ uri: cldCover(mediaUrl(a.coverImageUrl), compact ? 300 : 600) }} resizeMode="cover" style={[dimensions, { backgroundColor: C.sand }]} />;
  }
  return <View style={[dimensions, { backgroundColor: a.coverColor ?? C.green }]} />;
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
                  <View style={s.readMoreRow}>
                    <Text style={s.readMore}>Read story</Text>
                    <ArrowRightIcon size={15} color={C.greenText} strokeWidth={2.2} />
                  </View>
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
        <View style={[s.pad, { paddingTop: 10 }]}>
          <StaggerIn index={index + 1}>
            <Link href={route.newsArticle(a.slug)} asChild>
              <Pressable
                style={s.card}
                accessibilityRole="button"
                accessibilityLabel={`${a.title}. ${a.authorName}. ${newsDate(a)}`}
                accessibilityHint="Opens story"
              >
                <Cover article={a} height={132} compact />
                <View style={s.cardBody}>
                  <Text style={s.cardKicker} numberOfLines={1}>{a.tags?.[0] || "Oguaa newsroom"}</Text>
                  <Text style={s.title} numberOfLines={2}>{a.title}</Text>
                  {a.summary ? <Text style={s.summary} numberOfLines={1}>{a.summary}</Text> : null}
                  <View style={s.bylineRow}>
                    <Text style={s.byline} numberOfLines={1}>{a.authorName} · {newsDate(a)}</Text>
                    {a.authorVerified ? <VerifiedBadge size={13} /> : null}
                    <View style={s.cardArrow}>
                      <ArrowRightIcon size={14} color={C.greenText} strokeWidth={2.2} />
                    </View>
                  </View>
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
  heroKicker: { color: C.gold, fontSize: 10, letterSpacing: 2, ...S(700), textTransform: "uppercase" },
  heroTitle: { color: ON_GREEN, ...D(700), fontSize: 30, marginTop: 6 },
  heroLede: { color: onDarkText(C, 0.8), fontSize: 14, lineHeight: 20, marginTop: 6 },
  // shadowColor stays pure black — shadows are theme-independent.
  featured: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 18, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  featuredBody: { padding: 14 },
  featuredKicker: { color: C.goldText, fontSize: 10, letterSpacing: 2, ...S(700), textTransform: "uppercase" },
  featuredTitle: { ...S(700), fontSize: 24, color: C.ink, lineHeight: 30, marginTop: 6 },
  card: { flexDirection: "row", alignItems: "stretch", backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 18, overflow: "hidden", minHeight: 132, shadowColor: "#000", shadowOpacity: 0.035, shadowRadius: 7, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  cardBody: { flex: 1, minWidth: 0, paddingHorizontal: 12, paddingVertical: 10 },
  cardKicker: { color: C.goldText, ...S(700), fontSize: 9, letterSpacing: 1.05, textTransform: "uppercase" },
  title: { ...S(700), fontSize: 16, color: C.ink, lineHeight: 20, marginTop: 3 },
  summary: { color: C.inkMuted, fontSize: 12, lineHeight: 16, marginTop: 4 },
  bylineRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  byline: { flexShrink: 1, color: C.inkFaint, fontSize: 10 },
  cardArrow: { width: 27, height: 27, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: C.goldTint14, borderWidth: 1, borderColor: C.goldBorder35, marginLeft: "auto" },
  readMoreRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 7 },
  readMore: { color: C.greenText, fontSize: 12, ...S(700) },
});
