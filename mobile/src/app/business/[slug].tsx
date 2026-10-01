import { route } from "@/lib/routes";
import { useMemo, useState, type ReactNode } from "react";
import { Linking, ScrollView, StyleSheet, View, Pressable } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { T as Text, TI as TextInput } from "@/components/typography";
import { api } from "@/lib/api";
import { useRecordView } from "@/lib/use-record-view";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth";
import type { CommerceOrder, Listing, StoreItem } from "@/lib/types";
import { D, S, initials, withAlpha, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { Loading, ErrorView, Pill, Thumb } from "@/ui";
import { ReportButton } from "@/report-button";
import { isSponsored } from "@/components/notices";
import { RevealView } from "@/components/anim";
import { LocationCard } from "@/components/location-card";
import { useHostedCheckout } from "@/lib/use-hosted-checkout";
import { CheckoutPending } from "@/components/checkout-pending";

// Only open web-safe schemes (tel/mailto included — this is the call-them screen).
function openURL(url?: string) {
  const u = (url ?? "").trim();
  if (/^(https?:|mailto:|tel:)/i.test(u)) Linking.openURL(u).catch(() => {});
}

function fmtDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

export default function Business() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data, error, loading, reload } = useApi<Listing>(() => api.business(slug), `business:${slug}`);
  useRecordView(data?.id);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "Not found"} />;
  return <BusinessDetail data={data} slug={slug} reload={reload} />;
}

// Owner-only plan status. Digital plans are not sold in the app on any
// platform (App Store 3.1.1, Google Play Payments): the card only reports an
// entitlement bought elsewhere and renders nothing otherwise (D1).
function SupportCard({ business }: Readonly<{ business: Listing }>) {
  const { C } = useTheme();
  const sub = useMemo(() => makeSubStyles(C), [C]);
  if (!business.supporter || !business.details.subscribedUntil) return null;
  return (
    <View style={sub.card}>
      <Text style={sub.kicker}>YOUR PLAN</Text>
      <Text style={sub.active}>★ Supporter until {fmtDate(business.details.subscribedUntil)}</Text>
      <Text style={sub.body}>{business.title} shows the gold Supporter badge while the plan is active.</Text>
    </View>
  );
}

function BusinessDetail({ data, slug, reload }: Readonly<{ data: Listing; slug: string; reload: () => void }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { member } = useAuth();
  const d = data.details;
  const directions = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([data.title, d.address, "Cape Coast", "Ghana"].filter(Boolean).join(", "))}`;
  const isOwner = member != null && data.ownerId != null && member.id === data.ownerId;

  return (
    <>
      <Stack.Screen options={{ title: data.title }} />
      <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 48 }}>
        <RevealView>
          <Thumb seed={data.slug} src={data.coverImageUrl} label={initials(data.title)} style={s.cover} labelStyle={s.coverInit} />
        </RevealView>

        <RevealView delay={100} style={s.body}>
          <View style={s.pillRow}>
            {d.category ? <Pill label={d.category} color={C.tealText} bg={C.cream} border={C.sand} /> : null}
            {data.supporter ? <Pill label="★ Supporter" color={C.goldText} bg={C.cream} border={C.gold} /> : null}
            {isSponsored(data) ? <Pill label="Sponsored" color={C.goldText} bg={C.cream} border={C.goldText} /> : null}
          </View>
          <Text style={s.name}>{data.title}</Text>
          {d.description ? <Text style={s.desc}>{d.description}</Text> : null}

          {(d.services ?? []).length > 0 && (
            <>
              <Text style={[s.kicker, { marginTop: 22 }]}>SERVICES</Text>
              <View style={s.services}>
                {(d.services ?? []).map((sv) => (
                  <View key={sv.name} style={s.serviceRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.serviceName}>{sv.name}</Text>
                      {sv.note ? <Text style={s.serviceNote}>{sv.note}</Text> : null}
                    </View>
                    {sv.price ? <Text style={s.servicePrice}>{sv.price}</Text> : null}
                  </View>
                ))}
              </View>
            </>
          )}

          {(data.products ?? []).some((p) => p.available) ? <ProductShop business={data} slug={slug} /> : null}

          <Text style={[s.kicker, { marginTop: 22 }]}>FIND THEM</Text>
          {d.address ? <Text style={s.fact}>📍 {d.address}</Text> : null}
          {d.openingHours ? <Text style={s.fact}>🕔 {d.openingHours}</Text> : null}
          {d.address ? <LocationCard address={d.address} query={`${data.title} ${d.address}`} /> : null}

          <View style={{ gap: 8, marginTop: 12 }}>
            {(d.contact ?? []).map((c) => (
              <Pressable accessibilityRole="button" key={c.label} style={s.contact} onPress={() => openURL(c.url)}>
                <Text style={s.contactLabel}>{c.label}</Text>
                <Text style={s.contactArrow}>↗</Text>
              </Pressable>
            ))}
            {d.address ? (
              <Pressable accessibilityRole="button" style={[s.contact, s.directions]} onPress={() => openURL(directions)}>
                <Text style={[s.contactLabel, { color: C.cream }]}>Get directions</Text>
                <Text style={[s.contactArrow, { color: C.cream }]}>↗</Text>
              </Pressable>
            ) : null}
          </View>

          {isOwner && <SupportCard business={data} />}
          {isOwner && <Pressable accessibilityRole="button" style={[s.contact, { marginTop: 12 }]} onPress={() => router.push(route.businessCommerce(slug))}><Text style={s.contactLabel}>Promotions, coupons &amp; affiliates</Text><Text style={s.contactArrow}>→</Text></Pressable>}

          {data.tags.length > 0 && (
            <View style={s.tags}>
              {data.tags.map((t) => <Pill key={t} label={`#${t}`} color={C.tealText} bg={C.cream} border={C.sand} />)}
            </View>
          )}

          <View style={{ marginTop: 22, alignItems: "center" }}>
            <ReportButton listingId={data.id} />
          </View>
        </RevealView>
      </ScrollView>
    </>
  );
}

// Product checkout: start order → Paystack page → verify. The hosted checkout
// keeps the reference so the buyer verifies (or reopens the page) and checks
// quietly on return — never starting a second order for the same purchase.
function useProductCheckout(slug: string) {
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const [paid, setPaid] = useState<CommerceOrder | null>(null);
  const checkout = useHostedCheckout<CommerceOrder>({
    confirm: api.confirmOrder,
    isPaid: (order) => order.status === "paid",
    onPaid: setPaid,
    notConfirmed: ORDER_NOT_PAID,
  });

  async function start(body: Parameters<typeof api.startOrder>[1]) {
    if (checkout.pending) return; // one checkout at a time — verify or cancel it first
    setStarting(true); setStartError("");
    try {
      const r = await api.startOrder(slug, body);
      if (r.simulated) {
        const order = await api.confirmOrder(r.reference);
        if (order.status === "paid") setPaid(order); else setStartError(ORDER_NOT_PAID);
        return;
      }
      await checkout.begin({ reference: r.reference, url: r.authorizationUrl });
    } catch (e) {
      setStartError(e instanceof Error ? e.message : "Could not start checkout.");
    } finally { setStarting(false); }
  }

  return { busy: starting || checkout.busy, message: startError, checkout, paid, start };
}

const ORDER_NOT_PAID = "Payment isn't confirmed yet. Finish paying on the Paystack page, then verify again.";

function ProductShop({ business, slug }: Readonly<{ business: Listing; slug: string }>) {
  const { C } = useTheme(); const s = useMemo(() => makeProductStyles(C), [C]);
  const { data: commerce } = useApi<{ enabled: boolean }>(() => api.businessCommerceStatus(slug), `commerce:${slug}`);
  const [selected, setSelected] = useState<StoreItem | null>(null); const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [phone, setPhone] = useState(""); const [coupon, setCoupon] = useState(""); const [affiliate, setAffiliate] = useState("");
  const checkout = useProductCheckout(slug);
  function pay() { if (!selected?.id) return; checkout.start({ buyerName: name, buyerEmail: email, buyerPhone: phone, fulfilment: "pickup", couponCode: coupon, affiliateCode: affiliate, lines: [{ productId: selected.id, quantity: 1 }] }); }
  const locked = checkout.checkout.pending != null || checkout.paid != null;
  let form: ReactNode = null;
  if (checkout.paid) {
    form = <Text style={s.confirmed}>Order confirmed · {checkout.paid.reference}</Text>;
  } else if (checkout.checkout.pending) {
    form = <CheckoutPending checkout={checkout.checkout} reference style={{ marginTop: 14 }} />;
  } else if (selected) {
    const incomplete = checkout.busy || !name || !email || !phone;
    form = <View style={s.form}><TextInput value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={C.inkFaint} style={s.input}/><TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Email receipt" placeholderTextColor={C.inkFaint} style={s.input}/><TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Phone number" placeholderTextColor={C.inkFaint} style={s.input}/><TextInput value={coupon} onChangeText={(v) => setCoupon(v.toUpperCase())} autoCapitalize="characters" placeholder="Coupon code (optional)" placeholderTextColor={C.inkFaint} style={s.input}/><TextInput value={affiliate} onChangeText={(v) => setAffiliate(v.toUpperCase())} autoCapitalize="characters" placeholder="Affiliate code (optional)" placeholderTextColor={C.inkFaint} style={s.input}/><Pressable accessibilityRole="button" disabled={incomplete} onPress={pay} style={[s.pay, incomplete && { opacity: 0.5 }]}><Text style={s.payText}>{checkout.busy ? "Starting checkout…" : "Pay securely with Paystack"}</Text></Pressable>{checkout.message ? <Text style={s.message}>{checkout.message}</Text> : null}</View>;
  }
  return <View style={s.wrap}><Text style={s.kicker}>SHOP ONLINE</Text><Text style={s.title}>Products from {business.title}</Text>{(business.products ?? []).filter((p) => p.available).map((p) => <View key={p.id ?? p.name}><Pressable accessibilityRole="button" disabled={!commerce?.enabled || locked} onPress={() => setSelected(p)} style={[s.product, selected?.id === p.id && s.productOn]}><View style={{ flex: 1 }}><Text style={s.productName}>{p.name}</Text>{p.description ? <Text style={s.note}>{p.description}</Text> : null}</View><Text style={s.price}>GH₵ {((p.pricePesewas ?? 0) / 100).toFixed(2)}</Text></Pressable>{p.id ? <ReportButton target={{ type: "product", id: p.id, listingId: business.id }} compact /> : null}</View>)}{commerce?.enabled ? form : <Text style={s.disclosure}>Online checkout unlocks after Oguaa verifies this business and its settlement account.</Text>}<Text style={s.disclosure}>Oguaa verifies the payment and Paystack automatically splits settlement between this verified business and the platform.</Text></View>;
}

const makeProductStyles = (C: Palette) => StyleSheet.create({ wrap: { marginTop: 24, borderWidth: 1, borderColor: C.goldBorder, borderRadius: 16, padding: 16, backgroundColor: C.cream }, kicker: { ...S(700), fontSize: 11, letterSpacing: 1.5, color: C.goldText }, title: { ...D(700), fontSize: 21, color: C.ink, marginTop: 4, marginBottom: 10 }, product: { flexDirection: "row", gap: 12, borderWidth: 1, borderColor: C.sand, borderRadius: 12, padding: 12, marginTop: 8, backgroundColor: C.paper }, productOn: { borderColor: C.green }, productName: { ...S(700), color: C.ink }, note: { ...S(400), color: C.inkMuted, fontSize: 12, marginTop: 3 }, price: { ...S(700), color: C.greenText }, form: { gap: 8, marginTop: 14 }, input: { ...S(400), borderWidth: 1, borderColor: C.sand, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, color: C.ink, backgroundColor: C.paper }, pay: { alignItems: "center", borderRadius: 999, backgroundColor: C.green, paddingVertical: 13, marginTop: 4 }, payText: { ...S(700), color: C.cream }, message: { ...S(400), color: C.clayText, fontSize: 12, lineHeight: 18 }, confirmed: { ...S(700), color: C.greenText, fontSize: 14, marginTop: 14 }, disclosure: { ...S(400), color: C.inkFaint, fontSize: 11, lineHeight: 16, marginTop: 12 } });

const makeSubStyles = (C: Palette) => StyleSheet.create({
  card: { marginTop: 22, backgroundColor: withAlpha(C.gold, 0.08), borderWidth: 1, borderColor: C.gold, borderRadius: 14, padding: 16 },
  kicker: { color: C.goldText, fontSize: 11, letterSpacing: 2, ...D(700) },
  title: { ...S(700), fontSize: 18, color: C.ink, marginTop: 4 },
  body: { color: C.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  active: { color: C.goldText, fontSize: 13, ...S(700), marginTop: 10 },
  err: { color: C.clayText, fontSize: 13, marginTop: 10 },
  btn: { backgroundColor: C.goldBrand, borderRadius: 999, paddingVertical: 13, alignItems: "center", marginTop: 14 },
  btnText: { color: C.green900, ...S(700), fontSize: 15 },
  note: { color: C.inkFaint, fontSize: 11, textAlign: "center", marginTop: 8 },
  thanks: { marginTop: 12, backgroundColor: withAlpha(C.green, 0.06), borderWidth: 1, borderColor: withAlpha(C.green, 0.3), borderRadius: 12, padding: 14 },
  thanksTitle: { ...S(700), fontSize: 16, color: C.greenText },
  thanksBody: { color: C.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 4 },
});

const makeStyles = (C: Palette) => StyleSheet.create({
  cover: { width: "100%", height: 180, alignItems: "center", justifyContent: "center" },
  coverInit: { color: C.cream, ...S(700), fontSize: 40 },
  body: { padding: 20 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  name: { ...D(700), fontSize: 28, color: C.ink, marginTop: 10 },
  desc: { ...S(400), fontSize: 16, lineHeight: 24, color: C.ink, marginTop: 10 },
  kicker: { color: C.tealText, fontSize: 11, letterSpacing: 2, ...D(700) },
  services: { borderWidth: 1, borderColor: C.sand, borderRadius: 12, backgroundColor: C.cream, marginTop: 10, overflow: "hidden" },
  serviceRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.sand },
  serviceName: { color: C.ink, fontSize: 14, ...S(600) },
  serviceNote: { color: C.inkFaint, fontSize: 12, marginTop: 1 },
  servicePrice: { color: C.tealText, fontSize: 14, ...S(700) },
  fact: { color: C.ink, fontSize: 14, marginTop: 8 },
  contact: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderColor: C.teal, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 },
  directions: { backgroundColor: C.teal, borderColor: C.teal },
  contactLabel: { color: C.tealText, ...S(700) },
  contactArrow: { color: C.tealText },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 20 },
});
