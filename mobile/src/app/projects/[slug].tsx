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
import { Loading, ErrorView, PhotoHero, Pill, Thumb } from "@/ui";
import { ReportButton } from "@/report-button";
import { Progress, cedis } from "./index";
import { RevealView } from "@/components/anim";
import { UsersIcon } from "@/components/icons";

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
  const isCampaign = Boolean(d.campaign);

  return (
    <>
      <Stack.Screen options={{ title: project.title }} />
      <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 48 }}>
        <PhotoHero
          image={project.coverImageUrl}
          tone={C.green900}
          kicker={isCampaign ? "Creator campaign" : "Adopt a project"}
          title={project.title}
          lede={d.organiser ? `Led by ${d.organiser}` : "A public Oguaa funding record"}
          icon={<UsersIcon size={24} color={C.gold} strokeWidth={1.8} />}
        >
          <View style={s.heroBadge}><Text style={s.heroBadgeText}>{isCampaign ? "PUBLIC CREATOR RECORD" : "COMMUNITY FOCUS"}</Text></View>
        </PhotoHero>

        <RevealView delay={100} style={s.body}>
          <View style={s.snapshot}>
            <Thumb seed={project.slug} src={project.coverImageUrl} label={initials(project.title)} style={s.snapshotCover} labelStyle={s.coverInit} />
            <View style={s.snapshotBody}>
              <Text style={s.kicker}>CAMPAIGN PROGRESS</Text>
              <View style={s.progressWrap}><Progress raised={d.raisedPesewas} goal={d.goalPesewas} /></View>
            </View>
          </View>

          <View style={s.facts}>
            <Fact label="Backers" value={String(d.backers ?? 0)} styles={s} />
            <Fact label="Target" value={d.goalPesewas ? cedis(d.goalPesewas) : "Being finalised"} styles={s} />
            <Fact label="Funding closes" value={d.deadline ? String(d.deadline).slice(0, 10) : "Open-ended"} styles={s} />
          </View>

          <View style={s.story}>
            <Text style={s.kicker}>THE WORK</Text>
            <Text style={s.sectionTitle}>What this project will change.</Text>
            <Text style={s.desc}>{d.description || "The organising team is preparing the full campaign brief."}</Text>
            {project.tags.length > 0 ? (
              <View style={s.tags}>{project.tags.map((tag) => <Pill key={tag} label={`#${tag}`} color={C.greenText} bg={C.cream} border={C.sand} />)}</View>
            ) : null}
          </View>

          <View style={s.steps}>
            <FundingStep number="01" title="Pledge" body="Choose an amount and complete payment securely." styles={s} />
            <FundingStep number="02" title="Verify" body="Oguaa checks payment server-side before the public total moves." styles={s} />
            <FundingStep number="03" title="Account" body="The confirmed pledge is recorded against this campaign." styles={s} />
          </View>

          <View style={s.trust}>
            <Text style={s.trustKicker}>PUBLIC ACCOUNTABILITY</Text>
            <Text style={s.trustTitle}>Where the money goes</Text>
            <Text style={s.trustPanelBody}>Each pledge is verified server-side. The configured platform fee supports Oguaa, and the net amount is credited to the named project.</Text>
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

function Fact({ label, value, styles }: Readonly<{ label: string; value: string; styles: ReturnType<typeof makeStyles> }>) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

function FundingStep({ number, title, body, styles }: Readonly<{ number: string; title: string; body: string; styles: ReturnType<typeof makeStyles> }>) {
  return (
    <View style={styles.step}>
      <Text style={styles.stepNumber}>{number}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepBody}>{body}</Text>
      </View>
    </View>
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
  heroBadge: { alignSelf: "flex-start", borderWidth: 1, borderColor: C.goldBorder35, borderRadius: 999, backgroundColor: C.goldTint14, paddingHorizontal: 11, paddingVertical: 5 },
  heroBadgeText: { color: ON_GREEN, fontSize: 9, letterSpacing: 1.3, ...S(700) },
  coverInit: { color: ON_GREEN, ...S(700), fontSize: 28 },
  body: { padding: 20 },
  snapshot: { flexDirection: "row", overflow: "hidden", borderWidth: 1, borderColor: C.sand, borderRadius: 16, backgroundColor: C.cream },
  snapshotCover: { width: 104, minHeight: 118, alignItems: "center", justifyContent: "center" },
  snapshotBody: { flex: 1, justifyContent: "center", padding: 14 },
  progressWrap: { marginTop: 10 },
  kicker: { color: C.greenText, fontSize: 10, letterSpacing: 1.8, ...S(700) },
  facts: { flexDirection: "row", overflow: "hidden", marginTop: 10, borderWidth: 1, borderColor: C.sand, borderRadius: 14, backgroundColor: C.sand },
  fact: { flex: 1, minHeight: 74, paddingHorizontal: 10, paddingVertical: 12, backgroundColor: C.cream, borderRightWidth: 1, borderRightColor: C.sand },
  factLabel: { color: C.inkFaint, fontSize: 8, lineHeight: 11, letterSpacing: 1, textTransform: "uppercase", ...S(600) },
  factValue: { color: C.ink, fontSize: 12, lineHeight: 16, marginTop: 5, ...S(700) },
  story: { marginTop: 28 },
  sectionTitle: { ...D(700), fontSize: 29, lineHeight: 34, color: C.ink, marginTop: 7 },
  desc: { ...S(400), fontSize: 16, lineHeight: 25, color: C.inkMuted, marginTop: 14 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 15 },
  steps: { marginTop: 24, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.sand },
  step: { flexDirection: "row", gap: 14, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: C.sand },
  stepNumber: { color: C.goldText, fontSize: 11, ...S(700) },
  stepTitle: { color: C.ink, fontSize: 15, ...S(700) },
  stepBody: { color: C.inkMuted, fontSize: 12.5, lineHeight: 18, marginTop: 3 },
  trust: { marginTop: 24, backgroundColor: C.green900, borderRadius: 14, padding: 17, overflow: "hidden" },
  trustKicker: { color: C.gold, fontSize: 9, letterSpacing: 1.6, ...S(700) },
  trustTitle: { color: ON_GREEN, fontSize: 22, marginTop: 5, ...D(700) },
  trustPanelBody: { color: C.onDarkText85, fontSize: 13, lineHeight: 19, marginTop: 7 },
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
