import { useMemo, useState, type ReactNode } from "react";
import { Linking, ScrollView, StyleSheet, View, Pressable } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { T as Text } from "@/components/typography";
import { api } from "@/lib/api";
import { useRecordView } from "@/lib/use-record-view";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth";
import type { Listing, Subscription } from "@/lib/types";
import { D, S, initials, withAlpha, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { Loading, ErrorView, Pill, Thumb } from "@/ui";
import { ReportButton } from "@/report-button";
import { RevealView } from "@/components/anim";
import { LocationCard } from "@/components/location-card";

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

// Owner-only Supporter subscription (GH₵ 50/month) — Paystack handoff with a
// manual verify step, mirroring the projects pledge flow.
function SupportCard({ business, slug, reload }: Readonly<{ business: Listing; slug: string; reload: () => void }>) {
  const { C } = useTheme();
  const sub = useMemo(() => makeSubStyles(C), [C]);
  const { member } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [pendingRef, setPendingRef] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Subscription | null>(null);

  async function subscribe() {
    setErr("");
    if (!member) { router.push("/signin"); return; }
    setBusy(true);
    try {
      const r = await api.subscribe(slug);
      if (r.simulated) {
        const sub = await api.confirmSubscription(r.reference);
        setConfirmed(sub);
        reload();
      } else {
        setPendingRef(r.reference);
        WebBrowser.openBrowserAsync(r.authorizationUrl).catch(() => setErr("Could not open the payment page."));
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start the payment.");
    } finally { setBusy(false); }
  }

  async function verify() {
    if (!pendingRef) return;
    setBusy(true); setErr("");
    try {
      const sub = await api.confirmSubscription(pendingRef);
      setConfirmed(sub);
      setPendingRef(null);
      reload();
    } catch {
      setErr("Payment not confirmed yet. Finish paying in the browser, then verify again.");
    } finally { setBusy(false); }
  }

  let body: ReactNode;
  if (confirmed) {
    body = <SupportThanks business={business} confirmed={confirmed} />;
  } else if (pendingRef) {
    body = <SupportVerify err={err} busy={busy} verify={verify} />;
  } else {
    body = <SupportSubscribe business={business} err={err} busy={busy} subscribe={subscribe} />;
  }

  return (
    <View style={sub.card}>
      <Text style={sub.kicker}>SUPPORT OGUAA</Text>
      <Text style={sub.title}>Supporter — GH₵ 50/month</Text>
      <Text style={sub.body}>
        Your GH₵ 50 a month keeps the platform running — and gives {business.title} the gold Supporter badge and priority placement in the business directory. Renew manually: each payment adds another month.
      </Text>
      {business.supporter && business.details.subscribedUntil ? (
        <Text style={sub.active}>★ Supporter active until {fmtDate(business.details.subscribedUntil)}</Text>
      ) : null}
      {body}
    </View>
  );
}

function SupportThanks({ business, confirmed }: Readonly<{ business: Listing; confirmed: Subscription }>) {
  const { C } = useTheme();
  const sub = useMemo(() => makeSubStyles(C), [C]);
  return (
    <View style={sub.thanks}>
      <Text style={sub.thanksTitle}>Medaase! 🎉</Text>
      <Text style={sub.thanksBody}>
        Your support is confirmed — {business.title} is a Supporter until {confirmed.periodEnd ? fmtDate(confirmed.periodEnd) : "next month"}.
        {confirmed.simulated ? " (Simulated — dev mode, no real money moved.)" : ""}
      </Text>
    </View>
  );
}

function SupportVerify({ err, busy, verify }: Readonly<{ err: string; busy: boolean; verify: () => void }>) {
  const { C } = useTheme();
  const sub = useMemo(() => makeSubStyles(C), [C]);
  return (
    <>
      <Text style={[sub.body, { marginTop: 12 }]}>Complete the payment on the Paystack page that opened, then come back and verify.</Text>
      {err !== "" && <Text style={sub.err}>{err}</Text>}
      <Pressable onPress={verify} disabled={busy} style={[sub.btn, busy && { opacity: 0.6 }]}>
        <Text style={sub.btnText}>{busy ? "Checking…" : "I've paid — verify"}</Text>
      </Pressable>
    </>
  );
}

function SupportSubscribe({ business, err, busy, subscribe }: Readonly<{ business: Listing; err: string; busy: boolean; subscribe: () => void }>) {
  const { C } = useTheme();
  const sub = useMemo(() => makeSubStyles(C), [C]);
  const label = business.supporter ? "Renew — add another month" : "Subscribe with Paystack";
  return (
    <>
      {err !== "" && <Text style={sub.err}>{err}</Text>}
      <Pressable onPress={subscribe} disabled={busy} style={[sub.btn, busy && { opacity: 0.6 }]}>
        <Text style={sub.btnText}>{busy ? "Starting…" : label}</Text>
      </Pressable>
      <Text style={sub.note}>Mobile money &amp; cards via Paystack. GH₵ 50 per month.</Text>
    </>
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

          <Text style={[s.kicker, { marginTop: 22 }]}>FIND THEM</Text>
          {d.address ? <Text style={s.fact}>📍 {d.address}</Text> : null}
          {d.openingHours ? <Text style={s.fact}>🕔 {d.openingHours}</Text> : null}
          {d.address ? <LocationCard address={d.address} query={`${data.title} ${d.address}`} /> : null}

          <View style={{ gap: 8, marginTop: 12 }}>
            {(d.contact ?? []).map((c) => (
              <Pressable key={c.label} style={s.contact} onPress={() => openURL(c.url)}>
                <Text style={s.contactLabel}>{c.label}</Text>
                <Text style={s.contactArrow}>↗</Text>
              </Pressable>
            ))}
            {d.address ? (
              <Pressable style={[s.contact, s.directions]} onPress={() => openURL(directions)}>
                <Text style={[s.contactLabel, { color: C.cream }]}>Get directions</Text>
                <Text style={[s.contactArrow, { color: C.cream }]}>↗</Text>
              </Pressable>
            ) : null}
          </View>

          {isOwner && <SupportCard business={data} slug={slug} reload={reload} />}

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

const makeSubStyles = (C: Palette) => StyleSheet.create({
  card: { marginTop: 22, backgroundColor: withAlpha(C.gold, 0.08), borderWidth: 1, borderColor: C.gold, borderRadius: 14, padding: 16 },
  kicker: { color: C.goldText, fontSize: 11, letterSpacing: 2, fontWeight: "700" },
  title: { ...S(700), fontSize: 18, color: C.ink, marginTop: 4 },
  body: { color: C.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  active: { color: C.goldText, fontSize: 13, fontWeight: "700", marginTop: 10 },
  err: { color: C.clayText, fontSize: 13, marginTop: 10 },
  btn: { backgroundColor: C.goldBrand, borderRadius: 999, paddingVertical: 13, alignItems: "center", marginTop: 14 },
  btnText: { color: C.green900, fontWeight: "700", fontSize: 15 },
  note: { color: C.inkFaint, fontSize: 11, textAlign: "center", marginTop: 8 },
  thanks: { marginTop: 12, backgroundColor: withAlpha(C.green, 0.06), borderWidth: 1, borderColor: withAlpha(C.green, 0.3), borderRadius: 12, padding: 14 },
  thanksTitle: { ...S(700), fontSize: 16, color: C.green },
  thanksBody: { color: C.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 4 },
});

const makeStyles = (C: Palette) => StyleSheet.create({
  cover: { width: "100%", height: 180, alignItems: "center", justifyContent: "center" },
  coverInit: { color: C.cream, ...S(700), fontSize: 40 },
  body: { padding: 20 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  name: { ...D(700), fontSize: 28, color: C.ink, marginTop: 10 },
  desc: { ...S(400), fontSize: 16, lineHeight: 24, color: C.ink, marginTop: 10 },
  kicker: { color: C.tealText, fontSize: 11, letterSpacing: 2, fontWeight: "700" },
  services: { borderWidth: 1, borderColor: C.sand, borderRadius: 12, backgroundColor: C.cream, marginTop: 10, overflow: "hidden" },
  serviceRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.sand },
  serviceName: { color: C.ink, fontSize: 14, fontWeight: "600" },
  serviceNote: { color: C.inkFaint, fontSize: 12, marginTop: 1 },
  servicePrice: { color: C.tealText, fontSize: 14, fontWeight: "700" },
  fact: { color: C.ink, fontSize: 14, marginTop: 8 },
  contact: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderColor: C.teal, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 },
  directions: { backgroundColor: C.teal, borderColor: C.teal },
  contactLabel: { color: C.tealText, fontWeight: "700" },
  contactArrow: { color: C.tealText },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 20 },
});
