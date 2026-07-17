import { ROUTES } from "@/lib/routes";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { presentCheckout, sessionFromStartResponse } from "@/lib/payments";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { T as Text, TI as TextInput } from "@/components/typography";
import { api } from "@/lib/api";
import { useRecordView } from "@/lib/use-record-view";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme-context";
import type { Listing } from "@/lib/types";
import { D, S, ON_GREEN, initials, withAlpha, type Palette } from "@/theme";
import { Loading, ErrorView, Thumb } from "@/ui";
import { ReportButton } from "@/report-button";
import { Progress, cedis } from "./index";
import { RevealView } from "@/components/anim";

const QUICK = [20, 50, 100, 500]; // GHS

export default function Project() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data, error, loading, reload } = useApi<Listing>(() => api.projectDetail(slug), `project:${slug}`);
  useRecordView(data?.id);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "Not found"} />;
  return <Detail project={data} slug={slug} reload={reload} />;
}

function Detail({ project, slug, reload }: Readonly<{ project: Listing; slug: string; reload: () => void }>) {
  const d = project.details;
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);

  return (
    <>
      <Stack.Screen options={{ title: project.title }} />
      <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 48 }}>
        <RevealView>
          <Thumb seed={project.slug} src={project.coverImageUrl} label={initials(project.title)} style={s.cover} labelStyle={s.coverInit} />
        </RevealView>
        <RevealView delay={100} style={s.body}>
          <Text style={s.kicker}>ADOPT A PROJECT</Text>
          <Text style={s.title}>{project.title}</Text>
          {d.organiser ? <Text style={s.organiser}>{d.organiser}</Text> : null}

          <View style={{ marginTop: 16 }}>
            <Progress raised={d.raisedPesewas} goal={d.goalPesewas} />
            <Text style={s.meta}>{d.backers ?? 0} backers{d.deadline ? ` · closes ${d.deadline}` : ""}</Text>
          </View>

          <Text style={s.desc}>{d.description}</Text>

          <View style={s.trust}>
            <Text style={s.trustTitle}>Where the money goes</Text>
            <Text style={s.trustBody}>Funds are held for the named institution and released against receipts, which are published to backers. Oguaa takes nothing.</Text>
          </View>

          <PledgeBox slug={slug} reload={reload} />

          <View style={{ marginTop: 22, alignItems: "center" }}>
            <ReportButton listingId={project.id} />
          </View>
        </RevealView>
      </ScrollView>
    </>
  );
}

// Pledge flow: amount pick → Paystack handoff → manual verify. After a
// real-Paystack handoff we hold the reference and offer "Verify"; confirm is
// idempotent server-side, so verifying twice is harmless.
function PledgeBox({ slug, reload }: Readonly<{ slug: string; reload: () => void }>) {
  const { member } = useAuth();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [amount, setAmount] = useState("50");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [pendingRef, setPendingRef] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ amount: number; simulated?: boolean } | null>(null);

  async function startPledge() {
    setErr("");
    const cedisNum = Number.parseFloat(amount);
    if (!Number.isFinite(cedisNum) || cedisNum < 1) { setErr("Enter an amount of at least GH₵ 1."); return; }
    if (!member) { router.push(ROUTES.signIn); return; }
    setBusy(true);
    try {
      const r = await api.pledge(slug, { amountPesewas: Math.round(cedisNum * 100) });
      const amountPesewas = Math.round(cedisNum * 100);
      const result = await presentCheckout(
        sessionFromStartResponse(r, { amountPesewas, flow: "pledge", metadata: { projectSlug: slug } })
      );
      if (result.kind === "error") {
        setErr(result.message);
      } else if (result.kind === "cancelled") {
        // User closed the sheet/browser without paying — keep the form open.
      } else if (result.provider === "simulated") {
        const p = await api.confirmPledge(r.reference);
        setConfirmed({ amount: p.amountPesewas, simulated: true });
        reload();
      } else if (result.provider === "stripe") {
        const p = await api.confirmPledge(r.reference);
        setConfirmed({ amount: p.amountPesewas, simulated: p.simulated });
        reload();
      } else {
        setPendingRef(r.reference);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start the payment.");
    } finally { setBusy(false); }
  }

  async function verify() {
    if (!pendingRef) return;
    setBusy(true); setErr("");
    try {
      const p = await api.confirmPledge(pendingRef);
      setConfirmed({ amount: p.amountPesewas, simulated: p.simulated });
      setPendingRef(null);
      reload();
    } catch {
      setErr("Payment not confirmed yet. Finish paying in the browser, then verify again.");
    } finally { setBusy(false); }
  }

  if (confirmed) {
    return (
      <View style={s.thanks}>
        <Text style={s.thanksTitle}>Medaase! 🎉</Text>
        <Text style={s.thanksBody}>
          Your pledge of {cedis(confirmed.amount)} is confirmed.
          {confirmed.simulated ? " (Simulated — dev mode, no real money moved.)" : " A receipt is on its way to your email."}
        </Text>
      </View>
    );
  }

  if (pendingRef) {
    return (
      <View style={s.pledgeBox}>
        <Text style={s.pledgeLabel}>FINISH IN YOUR BROWSER</Text>
        <Text style={s.trustBody}>Complete the payment on the Paystack page that opened, then come back and verify.</Text>
        {err !== "" && <Text style={s.err}>{err}</Text>}
        <Pressable accessibilityRole="button" onPress={verify} disabled={busy} style={[s.pledgeBtn, busy && { opacity: 0.6 }]}>
          <Text style={s.pledgeBtnText}>{busy ? "Checking…" : "I've paid — verify"}</Text>
        </Pressable>
      </View>
    );
  }

  const pledgeLabel = member ? "Pledge with Paystack" : "Sign in to pledge";

  return (
    <View style={s.pledgeBox}>
      <Text style={s.pledgeLabel}>PLEDGE AN AMOUNT (GH₵)</Text>
      <View style={s.chips}>
        {QUICK.map((a) => (
          <Pressable accessibilityRole="button" key={a} onPress={() => setAmount(String(a))} style={[s.chip, amount === String(a) && s.chipOn]}>
            <Text style={[s.chipText, amount === String(a) && s.chipTextOn]}>{a}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        style={s.input}
        value={amount}
        onChangeText={(v) => { setAmount(v); setErr(""); }}
        keyboardType="decimal-pad"
        placeholder="Amount in GH₵"
        placeholderTextColor={C.inkFaint}
      />
      {err !== "" && <Text style={s.err}>{err}</Text>}
      <Pressable accessibilityRole="button" onPress={startPledge} disabled={busy} style={[s.pledgeBtn, busy && { opacity: 0.6 }]}>
        <Text style={s.pledgeBtnText}>{busy ? "Starting…" : pledgeLabel}</Text>
      </Pressable>
      <Text style={s.note}>Mobile money &amp; cards via Paystack. You&apos;ll get a receipt by email.</Text>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  cover: { width: "100%", height: 170, alignItems: "center", justifyContent: "center" },
  coverInit: { color: C.cream, ...S(700), fontSize: 38 },
  body: { padding: 20 },
  kicker: { color: C.greenText, fontSize: 11, letterSpacing: 2, ...D(700) },
  title: { ...D(700), fontSize: 27, color: C.ink, marginTop: 6 },
  organiser: { color: C.goldText, fontSize: 13, marginTop: 4 },
  meta: { color: C.inkFaint, fontSize: 12, marginTop: 6 },
  desc: { ...S(400), fontSize: 16, lineHeight: 25, color: C.ink, marginTop: 16 },
  trust: { marginTop: 18, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 12, padding: 14 },
  trustTitle: { color: C.ink, fontSize: 14, ...D(700) },
  trustBody: { color: C.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  pledgeBox: { marginTop: 18, backgroundColor: C.cream, borderWidth: 1, borderColor: C.green, borderRadius: 14, padding: 16 },
  pledgeLabel: { color: C.inkFaint, fontSize: 11, letterSpacing: 2, ...S(700) },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  chip: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  chipOn: { backgroundColor: C.green, borderColor: C.green },
  chipText: { color: C.inkMuted, fontSize: 14, ...S(700) },
  chipTextOn: { color: ON_GREEN },
  input: { marginTop: 10, borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: C.ink },
  err: { color: C.clayText, fontSize: 13, marginTop: 10 },
  pledgeBtn: { backgroundColor: C.green, borderRadius: 999, paddingVertical: 13, alignItems: "center", marginTop: 14 },
  pledgeBtnText: { color: ON_GREEN, ...S(700), fontSize: 15 },
  note: { color: C.inkFaint, fontSize: 11, textAlign: "center", marginTop: 8 },
  thanks: { marginTop: 18, backgroundColor: withAlpha(C.green, 0.06), borderWidth: 1, borderColor: withAlpha(C.green, 0.3), borderRadius: 14, padding: 16 },
  thanksTitle: { ...D(700), fontSize: 20, color: C.greenText },
  thanksBody: { color: C.inkMuted, fontSize: 14, lineHeight: 20, marginTop: 6 },
});
