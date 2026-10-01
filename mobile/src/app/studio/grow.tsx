import { useMemo } from "react";
import { ROUTES } from "@/lib/routes";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { T as Text } from "@/components/typography";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth";
import type { CreatorOverview, Plan, Subscription } from "@/lib/types";
import { D, ON_GREEN, S, withAlpha, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { Loading, ErrorView, HeroBand } from "@/ui";
import { MetricCard, fmtDate } from "@/components/studio-kit";
import { ArrowUpRightIcon, CheckIcon, GridIcon, StarIcon } from "@/components/icons";

/*
 * Grow — the member's plan and promotion status. Digital goods (plans, creator
 * plans, paid promotions) are not sold in the app on iOS or Android (App Store
 * 3.1.1, Google Play Payments; decision D1): no prices, no buy buttons and no
 * pointers to other ways to pay. Entitlements bought elsewhere still show here.
 */

interface GrowData {
  overview: CreatorOverview;
  subscriptions: Subscription[];
  plans: Plan[];
}

export default function StudioGrow() {
  const { member, loading: authLoading } = useAuth();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);

  const { data, loading, error } = useApi<GrowData>(async () => {
    if (!member) throw new Error("Not signed in");
    const [overview, subscriptions, plans] = await Promise.all([
      api.creatorOverview(),
      api.mySubscriptions().catch(() => [] as Subscription[]),
      api.plans().catch(() => [] as Plan[]),
    ]);
    return { overview, subscriptions, plans };
  }, `studio:grow:${member?.id ?? "anon"}`);

  if (authLoading || (loading && member)) return <Loading />;
  if (!member) {
    return (
      <View style={s.gate}>
        <Text style={s.gateTitle}>Grow</Text>
        <Text style={s.gateBody}>Sign in to see your plan and promotions.</Text>
        <Pressable accessibilityRole="button" onPress={() => router.replace(ROUTES.signIn)} style={s.primaryBtn}>
          <Text style={s.primaryBtnText}>Sign in / create account</Text>
        </Pressable>
      </View>
    );
  }
  if (error || !data) return <ErrorView message={error ?? "Couldn't load your plans"} />;

  const { overview, subscriptions, plans } = data;
  const nowIso = new Date().toISOString();
  const activeSubs = subscriptions.filter((sub) => sub.status === "success" && (sub.periodEnd ?? "") > nowIso);
  const planName = (slug: string) => plans.find((p) => p.slug === slug)?.name ?? "Supporter";
  const currentPlan = activeSubs.length > 0 ? planName(activeSubs[0].plan) : "Starter";

  return (
    <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 48 }}>
      <HeroBand
        tone={C.green}
        kicker="Grow"
        title="Plan & promotions"
        lede="Your plan, promotions that are running, and how your listings are doing."
      />

      <View style={s.body}>
        <View style={s.grid}>
          <MetricCard label="Your plan" value={currentPlan} icon={StarIcon} tone="ink" sub={overview.activeSubscription ? "Paid plan active" : "Free forever"} />
          <MetricCard label="Active promotions" value={overview.activePromotions} icon={ArrowUpRightIcon} tone="green" sub={overview.promotionDaysLeft ? `${overview.promotionDaysLeft} days remaining` : "None running"} />
          <MetricCard label="Live listings" value={overview.live} icon={GridIcon} tone="gold" sub={overview.pending ? `${overview.pending} in review` : "All reviewed"} href={ROUTES.studioWork} />
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Your plans</Text>
          {activeSubs.length === 0 ? (
            <Text style={s.cardLede}>You&apos;re on the free Starter plan.</Text>
          ) : (
            <View style={{ gap: 8, marginTop: 12 }}>
              {activeSubs.map((sub) => (
                <View key={sub.id} style={s.activeSubRow}>
                  <Text style={s.activeSubName} numberOfLines={1}>{sub.listingTitle} · {planName(sub.plan)}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <CheckIcon size={10} color={C.tealText} strokeWidth={2.5} />
                    <Text style={s.activeSubUntil}>until {fmtDate(sub.periodEnd)}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
          <Text style={s.renewNote}>Plan and promotion purchases aren&apos;t available in this app.</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  gate: { flex: 1, backgroundColor: C.paper, padding: 28, justifyContent: "center", alignItems: "center" },
  gateTitle: { ...D(600), fontSize: 26, color: C.ink, textAlign: "center" },
  gateBody: { color: C.inkMuted, fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 10, maxWidth: 320 },
  primaryBtn: { backgroundColor: C.green, borderRadius: 999, paddingVertical: 13, paddingHorizontal: 24, marginTop: 18 },
  primaryBtnText: { color: ON_GREEN, ...S(700), fontSize: 15 },

  body: { padding: 16, gap: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },

  okBanner: { backgroundColor: withAlpha(C.teal, 0.12), borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  okText: { color: C.tealText, fontSize: 13, ...S(600), lineHeight: 19 },
  errBanner: { backgroundColor: withAlpha(C.maroon, 0.08), borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  errText: { color: C.maroonText, fontSize: 13, ...S(600), lineHeight: 19 },

  card: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 16, padding: 18 },
  cardTitle: { ...S(700), fontSize: 17, color: C.ink },
  cardLede: { color: C.inkMuted, fontSize: 13, lineHeight: 20, marginTop: 6 },

  planCard: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 16, overflow: "hidden" },
  planCardFeatured: { borderColor: C.goldBorder },
  recommendChip: { position: "absolute", right: 14, top: 14, zIndex: 10, backgroundColor: withAlpha(C.gold, 0.16), borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  recommendText: { color: C.goldText, fontSize: 10, ...S(700), textTransform: "uppercase", letterSpacing: 0.5 },
  planHead: { padding: 18, borderBottomWidth: 1, borderBottomColor: C.sand },
  planName: { ...S(700), fontSize: 17, color: C.ink },
  priceRow: { flexDirection: "row", alignItems: "flex-end", gap: 6, marginTop: 8 },
  price: { ...D(700), fontSize: 28, color: C.ink },
  priceUnit: { color: C.inkFaint, fontSize: 14, ...S(600), marginBottom: 4 },
  priceNote: { color: C.inkFaint, fontSize: 12, marginTop: 4 },
  planBody: { padding: 18 },
  perkRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  perkTick: { width: 18, height: 18, borderRadius: 9, backgroundColor: withAlpha(C.gold, 0.2), alignItems: "center", justifyContent: "center", marginTop: 1 },
  perkTickText: { color: C.goldText, fontSize: 11, ...S(700) },
  perkText: { flex: 1, color: C.inkMuted, fontSize: 13, lineHeight: 19 },
  renewNote: { color: C.inkFaint, fontSize: 12, lineHeight: 18, marginTop: 14 },

  activeSubRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, backgroundColor: withAlpha(C.teal, 0.08), borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  activeSubName: { flex: 1, color: C.ink, fontSize: 13, ...S(600) },
  activeSubUntil: { color: C.tealText, fontSize: 11, ...S(700) },

  addWrap: { marginTop: 16, borderTopWidth: 1, borderTopColor: C.sand, paddingTop: 16, gap: 8 },
  addLabel: { color: C.inkFaint, fontSize: 11, ...S(700), letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 },
  infoBox: { flexDirection: "row", gap: 8, borderWidth: 1, borderColor: C.goldBorder, backgroundColor: withAlpha(C.gold, 0.08), borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12 },
  infoText: { flex: 1, color: C.inkMuted, fontSize: 13, lineHeight: 19 },
  bizRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, borderWidth: 1, borderColor: C.sand, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  bizName: { flex: 1, color: C.ink, fontSize: 14, ...S(600) },
  activeTag: { color: C.tealText, fontSize: 12, ...S(700) },
  subBtn: { backgroundColor: C.goldBrand, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  subBtnText: { color: C.green900, fontSize: 12, ...S(700) },
  verifyBtn: { backgroundColor: C.green },
  verifyBtnText: { color: ON_GREEN, fontSize: 12, ...S(700) },

  promoHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  promoIcon: { width: 32, height: 32, borderRadius: 9, backgroundColor: withAlpha(C.gold, 0.15), alignItems: "center", justifyContent: "center" },
  promoIconText: { color: C.goldText, fontSize: 16, ...S(700) },
  stepRow: { flexDirection: "row", gap: 12 },
  stepCol: { alignItems: "center", width: 28 },
  stepNum: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: C.goldBorder, backgroundColor: withAlpha(C.gold, 0.15), alignItems: "center", justifyContent: "center" },
  stepNumText: { color: C.goldText, fontSize: 12, ...S(700) },
  stepLine: { width: 1, flex: 1, backgroundColor: C.sand, marginTop: 4 },
  stepText: { flex: 1, color: C.inkMuted, fontSize: 13, lineHeight: 19, paddingTop: 4 },
  promoteBtn: { marginTop: 16, borderWidth: 1, borderColor: C.goldBrand, borderRadius: 999, paddingVertical: 11, alignItems: "center" },
  promoteBtnText: { color: C.goldText, fontSize: 14, ...S(700) },
});
