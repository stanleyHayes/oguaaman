import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth";
import type { EventView, Ticket, TicketTierView } from "@/lib/types";
import { C, serif, initials } from "@/theme";
import { Loading, ErrorView, Thumb, Pill } from "@/ui";
import { ReportButton } from "@/report-button";
import { cedis } from "../projects/index";

function fmtDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export default function EventDetail() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data, error, loading, reload } = useApi<EventView>(() => api.eventView(slug), `event:${slug}`);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "Not found"} />;
  return <Detail view={data} slug={slug} reload={reload} />;
}

function Detail({ view, slug, reload }: Readonly<{ view: EventView; slug: string; reload: () => void }>) {
  const { event } = view;
  const d = event.details;

  return (
    <>
      <Stack.Screen options={{ title: event.title }} />
      <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 48 }}>
        <Thumb seed={event.slug} src={event.coverImageUrl} label={initials(event.title)} style={s.cover} labelStyle={s.coverInit} />
        <View style={s.body}>
          <View style={s.pillRow}>
            <Pill label={d.anchorFestival ? "Event · homecoming" : "Event"} color={C.goldText} bg={C.cream} border={C.gold} />
          </View>
          <Text style={s.title}>{event.title}</Text>
          <Text style={s.meta}>
            {[fmtDate(d.startsAt), d.venue, d.organiser].filter(Boolean).join(" · ")}
          </Text>

          {d.description ? <Text style={s.desc}>{d.description}</Text> : null}

          {event.tags.length > 0 && (
            <View style={s.tags}>
              {event.tags.map((t) => <Pill key={t} label={`#${t}`} color={C.tealText} bg={C.cream} border={C.sand} />)}
            </View>
          )}

          {(d.programme ?? []).length > 0 && (
            <>
              <Text style={s.kicker}>PROGRAMME</Text>
              <View style={{ gap: 8, marginTop: 10 }}>
                {(d.programme ?? []).map((p) => (
                  <View key={`${p.day ?? ""}-${p.time ?? ""}-${p.title}`} style={s.progRow}>
                    <View style={s.progDay}>
                      <Text style={s.progDayText}>{p.day ?? ""}</Text>
                      {p.time ? <Text style={s.progTime}>{p.time}</Text> : null}
                    </View>
                    <Text style={s.progTitle}>{p.title}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {d.festival ? (
            <Pressable onPress={() => router.push(`/festivals/${d.festival}` as never)} style={s.festivalLink}>
              <Text style={s.festivalLinkText}>See every edition in the festival archive →</Text>
            </Pressable>
          ) : null}

          <TicketSection slug={slug} tiers={view.tiers} reload={reload} />

          <View style={{ marginTop: 22, alignItems: "center" }}>
            <ReportButton listingId={event.id} />
          </View>
        </View>
      </ScrollView>
    </>
  );
}

// Ticket purchase flow: tier pick → Paystack handoff → manual verify. Confirm
// is idempotent server-side, so verifying twice is harmless (same as pledges).
function useTicketFlow(slug: string, tiers: TicketTierView[], reload: () => void) {
  const { member } = useAuth();
  const [selected, setSelected] = useState(0);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [pendingRef, setPendingRef] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Ticket | null>(null);

  async function buy() {
    setErr("");
    const tier = tiers[selected];
    if (!tier) return;
    if (!member) { router.push("/signin"); return; }
    setBusy(true);
    try {
      const r = await api.buyTicket(slug, { tier: tier.name, qty });
      if (r.simulated) {
        const t = await api.confirmTicket(r.reference);
        setConfirmed(t);
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
      const t = await api.confirmTicket(pendingRef);
      setConfirmed(t);
      setPendingRef(null);
      reload();
    } catch {
      setErr("Payment not confirmed yet. Finish paying in the browser, then verify again.");
    } finally { setBusy(false); }
  }

  function select(i: number) { setSelected(i); setQty(1); setErr(""); }

  return { signedIn: member != null, selected, qty, busy, err, pendingRef, confirmed, setQty, select, buy, verify };
}

function TicketSection({ slug, tiers, reload }: Readonly<{ slug: string; tiers: TicketTierView[]; reload: () => void }>) {
  const flow = useTicketFlow(slug, tiers, reload);
  const tier = tiers[flow.selected];
  const maxQty = tier && tier.remaining !== null ? Math.max(1, Math.min(10, tier.remaining)) : 10;
  const soldOut = tier != null && tier.remaining !== null && tier.remaining < flow.qty;

  return (
    <>
      <Text style={s.kicker}>TICKETS</Text>
      <TicketBody tiers={tiers} flow={flow} maxQty={maxQty} soldOut={soldOut} />
    </>
  );
}

type TicketFlow = ReturnType<typeof useTicketFlow>;

function TicketBody({ tiers, flow, maxQty, soldOut }: Readonly<{ tiers: TicketTierView[]; flow: TicketFlow; maxQty: number; soldOut: boolean }>) {
  if (flow.confirmed) return <TicketThanks confirmed={flow.confirmed} />;
  if (flow.pendingRef) return <TicketVerify err={flow.err} busy={flow.busy} verify={flow.verify} />;
  if (tiers.length === 0) {
    return (
      <View style={s.freeBox}>
        <Text style={s.freeText}><Text style={{ color: C.green, fontWeight: "700" }}>Free entry</Text> — no ticket needed. Just come.</Text>
      </View>
    );
  }
  return (
    <TicketPurchase
      tiers={tiers}
      selected={flow.selected}
      qty={flow.qty}
      busy={flow.busy}
      err={flow.err}
      signedIn={flow.signedIn}
      maxQty={maxQty}
      soldOut={soldOut}
      onSelect={flow.select}
      onQty={flow.setQty}
      onBuy={flow.buy}
    />
  );
}

function TicketPurchase({ tiers, selected, qty, busy, err, signedIn, maxQty, soldOut, onSelect, onQty, onBuy }: Readonly<{
  tiers: TicketTierView[]; selected: number; qty: number; busy: boolean; err: string;
  signedIn: boolean; maxQty: number; soldOut: boolean;
  onSelect: (i: number) => void; onQty: (fn: (q: number) => number) => void; onBuy: () => void;
}>) {
  const tier = tiers[selected];
  let buyLabel = signedIn ? "Buy with Paystack" : "Sign in to buy";
  if (busy) buyLabel = "Starting…";
  return (
    <View style={s.ticketBox}>
      {tiers.map((t, i) => (
        <TierRow key={t.name} tier={t} on={selected === i} onPress={() => onSelect(i)} />
      ))}

      <View style={s.qtyRow}>
        <Text style={s.qtyLabel}>Quantity</Text>
        <View style={s.qtyControls}>
          <Pressable onPress={() => onQty((q) => Math.max(1, q - 1))} style={s.qtyBtn} accessibilityLabel="Fewer">
            <Text style={s.qtyBtnText}>−</Text>
          </Pressable>
          <Text style={s.qtyValue}>{qty}</Text>
          <Pressable onPress={() => onQty((q) => Math.min(maxQty, q + 1))} style={s.qtyBtn} accessibilityLabel="More">
            <Text style={s.qtyBtnText}>+</Text>
          </Pressable>
        </View>
      </View>

      {tier ? (
        <Text style={s.total}>Total: <Text style={{ color: C.ink, fontWeight: "700" }}>{cedis(tier.pricePesewas * qty)}</Text></Text>
      ) : null}
      {err !== "" && <Text style={s.err}>{err}</Text>}
      <Pressable onPress={onBuy} disabled={busy || !tier || soldOut} style={[s.buyBtn, (busy || !tier || soldOut) && { opacity: 0.6 }]}>
        <Text style={s.buyBtnText}>{buyLabel}</Text>
      </Pressable>
      <Text style={s.note}>Mobile money &amp; cards via Paystack. Your code arrives here and by email.</Text>
    </View>
  );
}

function TicketThanks({ confirmed }: Readonly<{ confirmed: Ticket }>) {
  return (
    <View style={s.thanks}>
      <Text style={s.thanksTitle}>Medaase! 🎟️</Text>
      <Text style={s.thanksBody}>
        {confirmed.qty} × {confirmed.tier} for {confirmed.eventTitle} ({cedis(confirmed.amountPesewas)}).
      </Text>
      {confirmed.code ? <Text style={s.code}>{confirmed.code}</Text> : null}
      <Text style={s.codeHint}>Your check-in code — show this at the gate.</Text>
      {confirmed.simulated ? <Text style={s.simNote}>Simulated — dev mode, no real money moved.</Text> : null}
      <Pressable onPress={() => router.push("/me")} style={s.meLink}>
        <Text style={s.meLinkText}>See all my tickets →</Text>
      </Pressable>
    </View>
  );
}

function TicketVerify({ err, busy, verify }: Readonly<{ err: string; busy: boolean; verify: () => void }>) {
  return (
    <View style={s.ticketBox}>
      <Text style={s.boxLabel}>FINISH IN YOUR BROWSER</Text>
      <Text style={s.boxBody}>Complete the payment on the Paystack page that opened, then come back and verify.</Text>
      {err !== "" && <Text style={s.err}>{err}</Text>}
      <Pressable onPress={verify} disabled={busy} style={[s.buyBtn, busy && { opacity: 0.6 }]}>
        <Text style={s.buyBtnText}>{busy ? "Checking…" : "I've paid — verify"}</Text>
      </Pressable>
    </View>
  );
}

function TierRow({ tier: t, on, onPress }: Readonly<{ tier: TicketTierView; on: boolean; onPress: () => void }>) {
  const out = t.remaining !== null && t.remaining <= 0;
  const remainingText = out ? "Sold out" : `${t.remaining} left`;
  return (
    <Pressable
      disabled={out}
      onPress={onPress}
      style={[s.tier, on && s.tierOn, out && { opacity: 0.5 }]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.tierName}>{t.name}</Text>
        <Text style={s.tierAvail}>{t.remaining === null ? "Unlimited" : remainingText}</Text>
      </View>
      <Text style={s.tierPrice}>{cedis(t.pricePesewas)}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  cover: { width: "100%", height: 170, alignItems: "center", justifyContent: "center" },
  coverInit: { color: C.cream, fontFamily: serif, fontSize: 38, fontWeight: "700" },
  body: { padding: 20 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  title: { fontFamily: serif, fontSize: 27, fontWeight: "700", color: C.ink, marginTop: 10 },
  meta: { color: C.goldText, fontSize: 13, marginTop: 4, lineHeight: 19 },
  desc: { fontFamily: serif, fontSize: 16, lineHeight: 25, color: C.ink, marginTop: 16 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 16 },
  kicker: { color: C.inkFaint, fontSize: 11, letterSpacing: 2, fontWeight: "700", marginTop: 26 },
  progRow: { flexDirection: "row", gap: 10, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 10, padding: 12 },
  progDay: { width: 130, flexShrink: 0 },
  progDayText: { color: C.goldText, fontSize: 12, fontWeight: "700", lineHeight: 17, textTransform: "uppercase", letterSpacing: 0.5 },
  progTime: { color: C.inkFaint, fontSize: 11, marginTop: 1 },
  progTitle: { color: C.ink, fontSize: 14, lineHeight: 20, flex: 1 },
  festivalLink: { marginTop: 18, borderWidth: 1, borderColor: C.gold, borderRadius: 999, paddingVertical: 12, alignItems: "center" },
  festivalLinkText: { color: C.goldText, fontWeight: "700", fontSize: 13 },
  ticketBox: { marginTop: 10, backgroundColor: C.cream, borderWidth: 1, borderColor: C.green, borderRadius: 14, padding: 16, gap: 10 },
  freeBox: { marginTop: 10, backgroundColor: "rgba(18,63,45,0.06)", borderWidth: 1, borderColor: "rgba(18,63,45,0.3)", borderRadius: 12, padding: 14 },
  freeText: { color: C.inkMuted, fontSize: 14, lineHeight: 20 },
  boxLabel: { color: C.inkFaint, fontSize: 11, letterSpacing: 2, fontWeight: "700" },
  boxBody: { color: C.inkMuted, fontSize: 13, lineHeight: 19 },
  tier: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 10, padding: 14 },
  tierOn: { borderColor: C.green, backgroundColor: "rgba(18,63,45,0.06)" },
  tierName: { color: C.ink, fontSize: 14, fontWeight: "600" },
  tierAvail: { color: C.inkFaint, fontSize: 12, marginTop: 1 },
  tierPrice: { fontFamily: serif, fontSize: 18, fontWeight: "700", color: C.green },
  qtyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  qtyLabel: { color: C.ink, fontSize: 14, fontWeight: "600" },
  qtyControls: { flexDirection: "row", alignItems: "center", gap: 14 },
  qtyBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, alignItems: "center", justifyContent: "center" },
  qtyBtnText: { color: C.inkMuted, fontSize: 20, fontWeight: "700" },
  qtyValue: { color: C.ink, fontSize: 16, fontWeight: "700", width: 20, textAlign: "center" },
  total: { color: C.inkMuted, fontSize: 14, textAlign: "right" },
  err: { color: C.clayText, fontSize: 13 },
  buyBtn: { backgroundColor: C.green, borderRadius: 999, paddingVertical: 13, alignItems: "center", marginTop: 4 },
  buyBtnText: { color: C.cream, fontWeight: "700", fontSize: 15 },
  note: { color: C.inkFaint, fontSize: 11, textAlign: "center" },
  thanks: { marginTop: 10, backgroundColor: "rgba(18,63,45,0.06)", borderWidth: 1, borderColor: "rgba(18,63,45,0.3)", borderRadius: 14, padding: 16, alignItems: "center" },
  thanksTitle: { fontFamily: serif, fontSize: 20, fontWeight: "700", color: C.green },
  thanksBody: { color: C.inkMuted, fontSize: 14, lineHeight: 20, marginTop: 6, textAlign: "center" },
  code: { fontSize: 30, fontWeight: "700", letterSpacing: 6, color: C.ink, marginTop: 14 },
  codeHint: { color: C.inkFaint, fontSize: 12, marginTop: 4 },
  simNote: { color: C.goldText, fontSize: 12, marginTop: 8 },
  meLink: { marginTop: 12, minHeight: 44, justifyContent: "center" },
  meLinkText: { color: C.tealText, fontSize: 14, fontWeight: "700" },
});
