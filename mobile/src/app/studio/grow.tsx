import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { T as Text } from "@/components/typography";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth";
import type { CreatorOverview, MemberView, Plan, Subscription } from "@/lib/types";
import { D, ON_GREEN, S, withAlpha, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { Loading, ErrorView, HeroBand } from "@/ui";
import { MetricCard, cedis, fmtDate } from "@/components/studio-kit";

/*
 * Grow — ports creator/src/pages/Grow.tsx. Two levers: feature individual
 * listings for a daily rate (the how-it-works card links to My Work, which owns
 * the promote flow), or put an approved business on a paid Supporter plan for a
 * standing boost. Subscriptions use the same subscribe/confirmSubscription reads
 * the web creator app calls; the mobile checkout mirrors me.tsx's PromoteControl
 * (open Paystack in the browser, then verify).
 */

interface GrowData {
  overview: CreatorOverview;
  view: MemberView;
  subscriptions: Subscription[];
  plans: Plan[];
}

// Per-business price of a plan (business override, else the default).
const businessPrice = (p: Plan) => p.prices.business ?? p.prices.default ?? 0;

const PROMO_STEPS = [
  "Pick an approved listing on the My Work screen.",
  "Choose 7, 14 or 30 days and pay with MoMo or card via Paystack.",
  "Your listing is featured immediately; extra purchases extend the run.",
];

export default function StudioGrow() {
  const { member, loading: authLoading } = useAuth();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);

  const { data, loading, error, reload } = useApi<GrowData>(async () => {
    if (!member) throw new Error("Not signed in");
    const [overview, view, subscriptions, plans] = await Promise.all([
      api.creatorOverview(),
      api.member(member.slug),
      api.mySubscriptions().catch(() => [] as Subscription[]),
      api.plans().catch(() => [] as Plan[]),
    ]);
    return { overview, view, subscriptions, plans };
  }, `studio:grow:${member?.id ?? "anon"}`);

  // Checkout state (shared across plan/business rows).
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [pending, setPending] = useState<{ key: string; reference: string } | null>(null);
  const [confirmed, setConfirmed] = useState<Subscription | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function subscribe(slug: string, plan: string) {
    const key = `${slug}:${plan}`;
    setErr(null);
    setBusyKey(key);
    try {
      const r = await api.subscribe(slug, plan);
      if (r.simulated) {
        const sub = await api.confirmSubscription(r.reference);
        setConfirmed(sub);
        setPending(null);
        reload();
      } else {
        setPending({ key, reference: r.reference });
        WebBrowser.openBrowserAsync(r.authorizationUrl).catch(() => setErr("Could not open the payment page."));
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start the payment.");
    } finally {
      setBusyKey(null);
    }
  }

  async function verify(key: string, reference: string) {
    setErr(null);
    setBusyKey(key);
    try {
      const sub = await api.confirmSubscription(reference);
      setConfirmed(sub);
      setPending(null);
      reload();
    } catch {
      setErr("Payment not confirmed yet. Finish paying in the browser, then verify again.");
    } finally {
      setBusyKey(null);
    }
  }

  if (authLoading || (loading && member)) return <Loading />;
  if (!member) {
    return (
      <View style={s.gate}>
        <Text style={s.gateTitle}>Grow</Text>
        <Text style={s.gateBody}>Sign in to promote your listings and pick a plan.</Text>
        <Pressable onPress={() => router.replace("/signin")} style={s.primaryBtn}>
          <Text style={s.primaryBtnText}>Sign in / create account</Text>
        </Pressable>
      </View>
    );
  }
  if (error || !data) return <ErrorView message={error ?? "Couldn't load your plans"} />;

  const { overview, view, subscriptions, plans } = data;
  const businesses = view.listings.filter((l) => l.type === "business" && l.status === "approved");
  const nowIso = new Date().toISOString();
  const activeSubs = subscriptions.filter((sub) => sub.status === "success" && (sub.periodEnd ?? "") > nowIso);
  const paidPlans = plans.filter((p) => p.interval === "month" && businessPrice(p) > 0);
  const planName = (slug: string) => plans.find((p) => p.slug === slug)?.name ?? "Supporter";
  const currentPlan = activeSubs.length > 0 ? planName(activeSubs[0].plan) : "Starter";

  return (
    <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 48 }}>
      <HeroBand
        tone={C.green}
        kicker="Grow"
        title="Promote & plan"
        lede="Feature individual listings for a daily rate, or put your business on the Supporter plan for a standing boost."
      />

      <View style={s.body}>
        {confirmed && (
          <View style={s.okBanner}>
            <Text style={s.okText}>Payment confirmed — “{confirmed.listingTitle}” is now a Supporter business. ✓</Text>
          </View>
        )}
        {err && (
          <View style={s.errBanner}>
            <Text style={s.errText}>{err}</Text>
          </View>
        )}

        <View style={s.grid}>
          <MetricCard label="Your plan" value={currentPlan} glyph="★" tone="ink" sub={overview.activeSubscription ? "Paid plan active" : "Free forever"} />
          <MetricCard label="Active promotions" value={overview.activePromotions} glyph="↗" tone="green" sub={overview.promotionDaysLeft ? `${overview.promotionDaysLeft} days remaining` : "None running"} />
          <MetricCard label="Live listings" value={overview.live} glyph="▦" tone="gold" sub={overview.pending ? `${overview.pending} in review` : "All reviewed"} href="/studio/work" />
        </View>

        {paidPlans.length === 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Plans</Text>
            <Text style={s.cardLede}>No paid plans are on sale right now — check back soon.</Text>
          </View>
        )}

        {paidPlans.map((plan) => {
          const price = businessPrice(plan);
          const creatorDelta = plan.prices.creator != null && plan.prices.creator !== plan.prices.default;
          const perks = plan.perks ?? [];
          return (
            <View key={plan.id} style={[s.planCard, plan.goldBadge && s.planCardFeatured]}>
              {plan.goldBadge && (
                <View style={s.recommendChip}>
                  <Text style={s.recommendText}>★ Recommended</Text>
                </View>
              )}
              <View style={s.planHead}>
                <Text style={s.planName}>{plan.name}</Text>
                <View style={s.priceRow}>
                  <Text style={s.price}>{cedis(price)}</Text>
                  <Text style={s.priceUnit}>/month</Text>
                </View>
                <Text style={s.priceNote}>
                  per business{creatorDelta ? ` · ${cedis(plan.prices.creator)}/mo for artist & organiser creators` : ""}
                </Text>
              </View>

              <View style={s.planBody}>
                {perks.length > 0 && (
                  <View style={{ gap: 9 }}>
                    {perks.map((perk) => (
                      <View key={perk} style={s.perkRow}>
                        <View style={s.perkTick}><Text style={s.perkTickText}>✓</Text></View>
                        <Text style={s.perkText}>{perk}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <Text style={s.renewNote}>Renewals stack — each payment extends your paid-until date by a month.</Text>

                {activeSubs.length > 0 && (
                  <View style={{ gap: 8, marginTop: 12 }}>
                    {activeSubs.map((sub) => (
                      <View key={sub.id} style={s.activeSubRow}>
                        <Text style={s.activeSubName} numberOfLines={1}>{sub.listingTitle} · {planName(sub.plan)}</Text>
                        <Text style={s.activeSubUntil}>★ until {fmtDate(sub.periodEnd)}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <View style={s.addWrap}>
                  {businesses.length === 0 ? (
                    <Pressable onPress={() => router.push("/studio/work" as never)} style={s.infoBox}>
                      <Text style={s.infoText}>You don&apos;t have an approved business listing yet. Add one first.</Text>
                    </Pressable>
                  ) : (
                    <>
                      <Text style={s.addLabel}>Add to a business</Text>
                      {businesses.map((b) => {
                        const active = activeSubs.some((sub) => sub.listingId === b.id);
                        const key = `${b.slug}:${plan.slug}`;
                        const isPending = pending?.key === key;
                        const isBusy = busyKey === key;
                        return (
                          <View key={key} style={s.bizRow}>
                            <Text style={s.bizName} numberOfLines={1}>{b.title}</Text>
                            {active ? (
                              <Text style={s.activeTag}>Active ✓</Text>
                            ) : isPending ? (
                              <Pressable onPress={() => verify(key, pending.reference)} disabled={isBusy} style={[s.subBtn, s.verifyBtn, isBusy && { opacity: 0.6 }]}>
                                <Text style={s.verifyBtnText}>{isBusy ? "Checking…" : "I've paid — verify"}</Text>
                              </Pressable>
                            ) : (
                              <Pressable onPress={() => subscribe(b.slug, plan.slug)} disabled={busyKey != null} style={[s.subBtn, busyKey != null && { opacity: 0.6 }]}>
                                <Text style={s.subBtnText}>{isBusy ? "Starting…" : `Subscribe · ${cedis(price)}`}</Text>
                              </Pressable>
                            )}
                          </View>
                        );
                      })}
                    </>
                  )}
                </View>
              </View>
            </View>
          );
        })}

        <View style={s.card}>
          <View style={s.promoHead}>
            <View style={s.promoIcon}><Text style={s.promoIconText}>↗</Text></View>
            <Text style={s.cardTitle}>Featured promotions</Text>
          </View>
          <Text style={s.cardLede}>
            Put any approved listing in the featured row across the app&apos;s front pages. GH₵ 10 per day, in 7, 14 or 30-day bundles.
          </Text>
          <View style={{ marginTop: 14, gap: 0 }}>
            {PROMO_STEPS.map((step, i) => {
              const last = i === PROMO_STEPS.length - 1;
              return (
                <View key={step} style={s.stepRow}>
                  <View style={s.stepCol}>
                    <View style={s.stepNum}><Text style={s.stepNumText}>{i + 1}</Text></View>
                    {!last && <View style={s.stepLine} />}
                  </View>
                  <Text style={[s.stepText, !last && { paddingBottom: 16 }]}>{step}</Text>
                </View>
              );
            })}
          </View>
          <Pressable onPress={() => router.push("/studio/work" as never)} style={s.promoteBtn}>
            <Text style={s.promoteBtnText}>↗ Promote a listing</Text>
          </Pressable>
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
  primaryBtnText: { color: ON_GREEN, fontWeight: "700", fontSize: 15 },

  body: { padding: 16, gap: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },

  okBanner: { backgroundColor: withAlpha(C.teal, 0.12), borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  okText: { color: C.tealText, fontSize: 13, fontWeight: "600", lineHeight: 19 },
  errBanner: { backgroundColor: withAlpha(C.maroon, 0.08), borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  errText: { color: C.maroonText, fontSize: 13, fontWeight: "600", lineHeight: 19 },

  card: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 16, padding: 18 },
  cardTitle: { ...S(700), fontSize: 17, color: C.ink },
  cardLede: { color: C.inkMuted, fontSize: 13, lineHeight: 20, marginTop: 6 },

  planCard: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 16, overflow: "hidden" },
  planCardFeatured: { borderColor: C.goldBorder },
  recommendChip: { position: "absolute", right: 14, top: 14, zIndex: 10, backgroundColor: withAlpha(C.gold, 0.16), borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  recommendText: { color: C.goldText, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  planHead: { padding: 18, borderBottomWidth: 1, borderBottomColor: C.sand },
  planName: { ...S(700), fontSize: 17, color: C.ink },
  priceRow: { flexDirection: "row", alignItems: "flex-end", gap: 6, marginTop: 8 },
  price: { ...D(700), fontSize: 28, color: C.ink },
  priceUnit: { color: C.inkFaint, fontSize: 14, fontWeight: "600", marginBottom: 4 },
  priceNote: { color: C.inkFaint, fontSize: 12, marginTop: 4 },
  planBody: { padding: 18 },
  perkRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  perkTick: { width: 18, height: 18, borderRadius: 9, backgroundColor: withAlpha(C.gold, 0.2), alignItems: "center", justifyContent: "center", marginTop: 1 },
  perkTickText: { color: C.goldText, fontSize: 11, fontWeight: "800" },
  perkText: { flex: 1, color: C.inkMuted, fontSize: 13, lineHeight: 19 },
  renewNote: { color: C.inkFaint, fontSize: 12, lineHeight: 18, marginTop: 14 },

  activeSubRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, backgroundColor: withAlpha(C.teal, 0.08), borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  activeSubName: { flex: 1, color: C.ink, fontSize: 13, fontWeight: "600" },
  activeSubUntil: { color: C.tealText, fontSize: 11, fontWeight: "700" },

  addWrap: { marginTop: 16, borderTopWidth: 1, borderTopColor: C.sand, paddingTop: 16, gap: 8 },
  addLabel: { color: C.inkFaint, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 },
  infoBox: { flexDirection: "row", gap: 8, borderWidth: 1, borderColor: C.goldBorder, backgroundColor: withAlpha(C.gold, 0.08), borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12 },
  infoText: { flex: 1, color: C.inkMuted, fontSize: 13, lineHeight: 19 },
  bizRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, borderWidth: 1, borderColor: C.sand, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  bizName: { flex: 1, color: C.ink, fontSize: 14, fontWeight: "600" },
  activeTag: { color: C.tealText, fontSize: 12, fontWeight: "700" },
  subBtn: { backgroundColor: C.goldBrand, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  subBtnText: { color: C.green900, fontSize: 12, fontWeight: "700" },
  verifyBtn: { backgroundColor: C.green },
  verifyBtnText: { color: ON_GREEN, fontSize: 12, fontWeight: "700" },

  promoHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  promoIcon: { width: 32, height: 32, borderRadius: 9, backgroundColor: withAlpha(C.gold, 0.15), alignItems: "center", justifyContent: "center" },
  promoIconText: { color: C.goldText, fontSize: 16, fontWeight: "700" },
  stepRow: { flexDirection: "row", gap: 12 },
  stepCol: { alignItems: "center", width: 28 },
  stepNum: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: C.goldBorder, backgroundColor: withAlpha(C.gold, 0.15), alignItems: "center", justifyContent: "center" },
  stepNumText: { color: C.goldText, fontSize: 12, fontWeight: "800" },
  stepLine: { width: 1, flex: 1, backgroundColor: C.sand, marginTop: 4 },
  stepText: { flex: 1, color: C.inkMuted, fontSize: 13, lineHeight: 19, paddingTop: 4 },
  promoteBtn: { marginTop: 16, borderWidth: 1, borderColor: C.goldBrand, borderRadius: 999, paddingVertical: 11, alignItems: "center" },
  promoteBtnText: { color: C.goldText, fontSize: 14, fontWeight: "700" },
});
