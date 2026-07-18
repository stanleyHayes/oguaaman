import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { T as Text, TI as TextInput } from "@/components/typography";
import { ImageField } from "@/components/image-field";
import { ArrowRightIcon, BriefcaseIcon, CheckIcon, ShieldIcon } from "@/components/icons";
import { OutsideDisclaimer, cedis } from "@/components/outside";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { push } from "@/lib/router";
import { ROUTES } from "@/lib/routes";
import { useApi } from "@/lib/use-api";
import { useTheme } from "@/lib/theme-context";
import type { Agent, AgentInput, AgentService, AgentType } from "@/lib/types";
import { D, ON_GREEN, S, withAlpha, type Palette } from "@/theme";
import { ErrorView, Loading } from "@/ui";

interface ApplyData {
  services: AgentService[];
  agent: Agent | null;
}

export default function BecomeOutsideAgentScreen() {
  const { member, loading: authLoading } = useAuth();
  const { data, loading, error } = useApi<ApplyData>(async () => {
    const [services, agent] = await Promise.all([
      api.agentServices().catch(() => [] as AgentService[]),
      member ? api.myAgent().catch(() => null) : Promise.resolve(null),
    ]);
    return { services, agent };
  }, `outside:application:${member?.id ?? "guest"}`);

  if (authLoading || loading) return <Loading />;
  if (!member) return <SignInGate />;
  if (error || !data) return <ErrorView message={error ?? "Agent application unavailable"} />;

  return <AgentApplication initialAgent={data.agent} services={data.services} memberName={member.displayName} />;
}

function SignInGate() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={s.gate}>
      <View style={s.gateIcon}><BriefcaseIcon size={30} color={C.goldText} strokeWidth={1.8} /></View>
      <Text style={s.gateKicker}>OGUAA OUTSIDE</Text>
      <Text style={s.gateTitle}>Apply from your account</Text>
      <Text style={s.gateBody}>Every agent is tied to a verified member profile, a private identity record and a Cape Coast guarantor.</Text>
      <Pressable accessibilityRole="button" onPress={() => push(ROUTES.signIn)} style={s.primaryButton}>
        <Text style={s.primaryButtonText}>Sign in or create account</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => push(ROUTES.outside)} style={s.textButton}>
        <Text style={s.textButtonLabel}>Browse the directory</Text>
      </Pressable>
    </View>
  );
}

function AgentApplication({ initialAgent, services, memberName }: Readonly<{ initialAgent: Agent | null; services: AgentService[]; memberName: string }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [agent, setAgent] = useState(initialAgent);
  const [type, setType] = useState<AgentType>(initialAgent?.type ?? "individual");
  const [displayName, setDisplayName] = useState(initialAgent?.displayName ?? memberName);
  const [headline, setHeadline] = useState(initialAgent?.headline ?? "");
  const [bio, setBio] = useState(initialAgent?.bio ?? "");
  const [selectedServices, setSelectedServices] = useState<string[]>(initialAgent?.services ?? []);
  const [coverage, setCoverage] = useState(initialAgent?.coverageAreas.join(", ") ?? "");
  const [rates, setRates] = useState(initialAgent?.rates ?? "");
  const [idDocUrl, setIdDocUrl] = useState(initialAgent?.idDocUrl ?? "");
  const [guarantorName, setGuarantorName] = useState(initialAgent?.guarantor?.name ?? "");
  const [guarantorPhone, setGuarantorPhone] = useState(initialAgent?.guarantor?.phone ?? "");
  const [guarantorRelation, setGuarantorRelation] = useState(initialAgent?.guarantor?.relation ?? "");
  const [guarantorNote, setGuarantorNote] = useState(initialAgent?.guarantor?.note ?? "");
  const [payoutMethod, setPayoutMethod] = useState(initialAgent?.payoutMethod === "bank" ? "bank" : "momo");
  const [payoutDetail, setPayoutDetail] = useState(initialAgent?.payoutDetail ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  function toggleService(slug: string) {
    setSelectedServices((current) => current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug]);
    setError("");
  }

  async function submit() {
    const places = coverage.split(",").map((item) => item.trim()).filter(Boolean);
    if (displayName.trim().length < 2) { setError("Enter the name clients should see."); return; }
    if (!selectedServices.length) { setError("Choose at least one service you offer."); return; }
    if (!places.length) { setError("Add at least one place you cover."); return; }
    if (!idDocUrl.trim()) { setError("Upload a government-issued ID for the private vetting record."); return; }
    if (!guarantorName.trim() || !guarantorPhone.trim()) { setError("Add your Cape Coast guarantor's name and phone number."); return; }
    if (!payoutDetail.trim()) { setError("Add the MoMo number or bank account where approved payouts should go."); return; }

    const input: AgentInput = {
      type,
      displayName: displayName.trim(),
      headline: headline.trim(),
      bio: bio.trim(),
      services: selectedServices,
      coverageAreas: places,
      rates: rates.trim(),
      idDocUrl: idDocUrl.trim(),
      guarantor: {
        name: guarantorName.trim(),
        phone: guarantorPhone.trim(),
        relation: guarantorRelation.trim(),
        note: guarantorNote.trim(),
      },
      payoutMethod,
      payoutDetail: payoutDetail.trim(),
    };

    setBusy(true); setError(""); setSaved("");
    try {
      const result = agent ? await api.updateAgent(input) : await api.applyAgent(input);
      setAgent(result);
      setSaved(agent ? "Your agent profile has been updated." : "Application received. The vetting team will review your identity and guarantor.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The application could not be saved.");
    } finally { setBusy(false); }
  }

  return (
    <>
      <Stack.Screen options={{ title: agent ? "Agent profile" : "Become an agent" }} />
      <ScrollView style={s.page} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={s.hero}>
          <View style={s.heroOrb} />
          <Text style={s.heroKicker}>{agent ? "YOUR OGUAA OUTSIDE PROFILE" : "WORK WITH TRUST · EARN WITH CARE"}</Text>
          <Text style={s.heroTitle}>{agent ? "Keep your trust record current." : "Become the person Oguaa can call."}</Text>
          <Text style={s.heroBody}>{agent ? "Update what you offer, where you work and how clients can rely on you." : "Run errands, verify purchases and coordinate work for Cape Coast people wherever they are."}</Text>
          <View style={s.heroActions}>
            <Pressable accessibilityRole="button" onPress={() => push(ROUTES.outsideJobs)} style={s.heroButton}><Text style={s.heroButtonText}>My requests</Text><ArrowRightIcon size={15} color={C.green900} strokeWidth={2.3} /></Pressable>
            <Pressable accessibilityRole="button" onPress={() => push(ROUTES.outside)} style={s.heroLink}><Text style={s.heroLinkText}>Public directory</Text></Pressable>
          </View>
        </View>

        <View style={s.main}>
          {agent ? <AgentStatusCard agent={agent} /> : null}
          <OutsideDisclaimer compact />

          <FormSection number="01" kicker="PUBLIC PROFILE" title="How clients meet you">
            <Text style={s.fieldLabel}>PROFILE TYPE</Text>
            <View style={s.choiceRow}>
              <Choice label="Individual" selected={type === "individual"} onPress={() => setType("individual")} />
              <Choice label="Registered office" selected={type === "office"} onPress={() => setType("office")} />
            </View>
            <Field label="DISPLAY NAME" hint="The name clients see in the directory.">
              <TextInput value={displayName} onChangeText={(value) => { setDisplayName(value); setError(""); }} placeholder="Your name or office" placeholderTextColor={C.inkFaint} style={s.input} maxLength={120} />
            </Field>
            <Field label="ONE-LINE HEADLINE" hint="What do you do especially well?">
              <TextInput value={headline} onChangeText={setHeadline} placeholder="Accra procurement & courier, 6 years" placeholderTextColor={C.inkFaint} style={s.input} maxLength={160} />
            </Field>
            <Field label="ABOUT YOU" hint="Experience, working style and useful guarantees.">
              <TextInput value={bio} onChangeText={setBio} placeholder="Tell clients why they can rely on you…" placeholderTextColor={C.inkFaint} style={[s.input, s.textarea]} multiline />
            </Field>
          </FormSection>

          <FormSection number="02" kicker="SERVICES & COVERAGE" title="What you can handle">
            <Text style={s.fieldLabel}>SERVICES YOU OFFER</Text>
            {services.length ? (
              <View style={s.serviceGrid}>
                {services.map((service) => <Choice key={service.slug} label={service.label} selected={selectedServices.includes(service.slug)} onPress={() => toggleService(service.slug)} wide />)}
              </View>
            ) : <Text style={s.noCatalogue}>The service catalogue is temporarily unavailable.</Text>}
            <Field label="COVERAGE AREAS" hint="Separate places with commas — e.g. Accra, Tema, Guangzhou.">
              <TextInput value={coverage} onChangeText={(value) => { setCoverage(value); setError(""); }} placeholder="Accra, Tema, China" placeholderTextColor={C.inkFaint} style={s.input} />
            </Field>
            <Field label="RATE GUIDE" hint="A simple fee guide; each client still receives a firm quote.">
              <TextInput value={rates} onChangeText={setRates} placeholder="10% of order value; GH₵50 minimum" placeholderTextColor={C.inkFaint} style={[s.input, s.smallArea]} multiline />
            </Field>
          </FormSection>

          <FormSection number="03" kicker="PRIVATE VETTING" title="Identity and guarantor">
            <Text style={s.privacyNote}>These details go only to the vetting team. They never appear in the public directory.</Text>
            <Field label="GOVERNMENT-ISSUED ID" hint="Upload a clear Ghana Card, passport or driver's licence image.">
              <ImageField value={idDocUrl} onChange={(value) => { setIdDocUrl(value); setError(""); }} />
            </Field>
            <Field label="GUARANTOR NAME" hint="A Cape Coast person who can vouch for you.">
              <TextInput value={guarantorName} onChangeText={(value) => { setGuarantorName(value); setError(""); }} placeholder="Full name" placeholderTextColor={C.inkFaint} style={s.input} />
            </Field>
            <Field label="GUARANTOR PHONE">
              <TextInput value={guarantorPhone} onChangeText={(value) => { setGuarantorPhone(value); setError(""); }} placeholder="024 000 0000" placeholderTextColor={C.inkFaint} keyboardType="phone-pad" style={s.input} />
            </Field>
            <Field label="RELATIONSHIP" hint="How does this person know you?">
              <TextInput value={guarantorRelation} onChangeText={setGuarantorRelation} placeholder="Employer, elder, colleague…" placeholderTextColor={C.inkFaint} style={s.input} />
            </Field>
            <Field label="GUARANTOR NOTE" hint="Optional Cape Coast context for the vetting team.">
              <TextInput value={guarantorNote} onChangeText={setGuarantorNote} placeholder="Anything useful for the check" placeholderTextColor={C.inkFaint} style={[s.input, s.smallArea]} multiline />
            </Field>
          </FormSection>

          <FormSection number="04" kicker="PAYOUT" title="Where released escrow goes">
            <Text style={s.fieldLabel}>PAYOUT METHOD</Text>
            <View style={s.choiceRow}>
              <Choice label="Mobile money" selected={payoutMethod === "momo"} onPress={() => setPayoutMethod("momo")} />
              <Choice label="Bank account" selected={payoutMethod === "bank"} onPress={() => setPayoutMethod("bank")} />
            </View>
            <Field label={payoutMethod === "momo" ? "MOMO NUMBER & NETWORK" : "BANK ACCOUNT DETAILS"} hint="Used only when escrow is released after completed work.">
              <TextInput value={payoutDetail} onChangeText={(value) => { setPayoutDetail(value); setError(""); }} placeholder={payoutMethod === "momo" ? "024 000 0000 · MTN" : "Bank · account name · account number"} placeholderTextColor={C.inkFaint} style={[s.input, payoutMethod === "bank" && s.smallArea]} multiline={payoutMethod === "bank"} />
            </Field>
          </FormSection>

          <View style={s.bondCard}>
            <View style={s.bondIcon}><ShieldIcon size={22} color={C.goldText} strokeWidth={2} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.bondKicker}>REFUNDABLE GOOD-FAITH BOND</Text>
              <Text style={s.bondTitle}>{cedis(agent?.bond?.amountPesewas || 20_000)}</Text>
              <Text style={s.bondBody}>The vetting team explains the bond step before approval. It is refundable when an agent leaves in good standing.</Text>
            </View>
          </View>

          {error ? <Text style={s.error}>{error}</Text> : null}
          {saved ? <Text style={s.saved}>{saved}</Text> : null}
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void submit(); }} style={[s.submitButton, busy && { opacity: 0.55 }]}>
            <Text style={s.submitButtonText}>{busy ? "Saving…" : agent ? "Save profile changes" : "Submit application"}</Text>
            {!busy ? <ArrowRightIcon size={17} color={ON_GREEN} strokeWidth={2.4} /> : null}
          </Pressable>
          <Text style={s.submitNote}>By submitting, you confirm that the identity, guarantor and payout details are accurate.</Text>
        </View>
      </ScrollView>
    </>
  );
}

function AgentStatusCard({ agent }: Readonly<{ agent: Agent }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const meta = {
    pending: { label: "Vetting in progress", body: "Your profile stays private while the team checks your identity and guarantor.", color: C.goldText },
    verified: { label: "Verified and visible", body: "Clients can find your profile and send protected job requests.", color: C.greenText },
    suspended: { label: "Profile suspended", body: "Your profile is hidden. Contact the vetting team before accepting new work.", color: C.maroonText },
    rejected: { label: "Application needs attention", body: agent.rejectionReason || "Review the details below and contact the vetting team.", color: C.clayText },
  }[agent.status];
  return (
    <View style={[s.statusCard, { borderColor: withAlpha(meta.color, 0.3), backgroundColor: withAlpha(meta.color, 0.08) }]}>
      <View style={[s.statusIcon, { backgroundColor: withAlpha(meta.color, 0.14) }]}><CheckIcon size={18} color={meta.color} strokeWidth={2.4} /></View>
      <View style={{ flex: 1 }}><Text style={[s.statusLabel, { color: meta.color }]}>{meta.label}</Text><Text style={s.statusBody}>{meta.body}</Text></View>
    </View>
  );
}

function FormSection({ number, kicker, title, children }: Readonly<{ number: string; kicker: string; title: string; children: React.ReactNode }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={s.formCard}>
      <View style={s.formHead}><Text style={s.formNumber}>{number}</Text><View><Text style={s.formKicker}>{kicker}</Text><Text style={s.formTitle}>{title}</Text></View></View>
      <View style={s.formBody}>{children}</View>
    </View>
  );
}

function Field({ label, hint, children }: Readonly<{ label: string; hint?: string; children: React.ReactNode }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      {hint ? <Text style={s.fieldHint}>{hint}</Text> : null}
      <View style={s.fieldControl}>{children}</View>
    </View>
  );
}

function Choice({ label, selected, onPress, wide = false }: Readonly<{ label: string; selected: boolean; onPress: () => void; wide?: boolean }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[s.choice, wide && s.choiceWide, selected && s.choiceActive]}>
      {selected ? <CheckIcon size={14} color={ON_GREEN} strokeWidth={2.6} /> : null}
      <Text style={[s.choiceText, selected && s.choiceTextActive]}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  page: { flex: 1, backgroundColor: C.paper },
  content: { paddingBottom: 54 },
  hero: { minHeight: 350, overflow: "hidden", backgroundColor: C.green900, paddingHorizontal: 22, paddingTop: 42, paddingBottom: 32 },
  heroOrb: { position: "absolute", width: 290, height: 290, borderRadius: 155, right: -120, top: -120, backgroundColor: C.goldTint14, borderWidth: 1, borderColor: C.goldBorder35 },
  heroKicker: { color: C.gold, ...S(700), fontSize: 9, letterSpacing: 1.8 },
  heroTitle: { color: ON_GREEN, ...D(700), fontSize: 39, lineHeight: 43, maxWidth: 345, marginTop: 10 },
  heroBody: { color: C.onDarkText85, fontSize: 14, lineHeight: 21, maxWidth: 340, marginTop: 13 },
  heroActions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 13, marginTop: 22 },
  heroButton: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: C.goldBrand, borderRadius: 999, paddingHorizontal: 16 },
  heroButtonText: { color: C.green900, ...S(700), fontSize: 12 },
  heroLink: { minHeight: 44, justifyContent: "center", paddingHorizontal: 5 },
  heroLinkText: { color: ON_GREEN, ...S(700), fontSize: 12, textDecorationLine: "underline" },
  main: { paddingHorizontal: 16, gap: 15, marginTop: -16 },
  statusCard: { flexDirection: "row", gap: 11, borderWidth: 1, borderRadius: 18, padding: 14 },
  statusIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  statusLabel: { ...S(700), fontSize: 13 },
  statusBody: { color: C.inkMuted, fontSize: 11.5, lineHeight: 17, marginTop: 3 },
  formCard: { overflow: "hidden", borderWidth: 1, borderColor: C.sand, borderRadius: 21, backgroundColor: C.cream },
  formHead: { flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.sand, backgroundColor: C.paper, padding: 15 },
  formNumber: { color: C.goldText, ...D(700), fontSize: 24, width: 34 },
  formKicker: { color: C.inkFaint, ...S(700), fontSize: 8.5, letterSpacing: 1.45 },
  formTitle: { color: C.ink, ...D(700), fontSize: 20, marginTop: 2 },
  formBody: { padding: 15 },
  field: { marginTop: 15 },
  fieldLabel: { color: C.inkFaint, ...S(700), fontSize: 8.5, letterSpacing: 1.35 },
  fieldHint: { color: C.inkMuted, fontSize: 10.5, lineHeight: 16, marginTop: 3 },
  fieldControl: { marginTop: 7 },
  input: { minHeight: 48, borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 11, paddingHorizontal: 13, paddingVertical: 11, color: C.ink, fontSize: 13.5 },
  textarea: { minHeight: 112, textAlignVertical: "top" },
  smallArea: { minHeight: 76, textAlignVertical: "top" },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 7 },
  serviceGrid: { gap: 8, marginTop: 8 },
  choice: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 999, paddingHorizontal: 13 },
  choiceWide: { alignSelf: "stretch", justifyContent: "flex-start", borderRadius: 13, paddingVertical: 10 },
  choiceActive: { borderColor: C.green, backgroundColor: C.green },
  choiceText: { color: C.inkMuted, ...S(600), fontSize: 11.5 },
  choiceTextActive: { color: ON_GREEN },
  noCatalogue: { color: C.inkFaint, fontSize: 12, lineHeight: 18, marginTop: 8 },
  privacyNote: { color: C.tealText, fontSize: 11.5, lineHeight: 18, borderWidth: 1, borderColor: withAlpha(C.teal, 0.25), backgroundColor: withAlpha(C.teal, 0.06), borderRadius: 12, padding: 11 },
  bondCard: { flexDirection: "row", gap: 12, borderWidth: 1, borderColor: C.goldBorder35, backgroundColor: C.goldTint14, borderRadius: 19, padding: 15 },
  bondIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: C.cream, borderWidth: 1, borderColor: C.goldBorder35 },
  bondKicker: { color: C.goldText, ...S(700), fontSize: 8.5, letterSpacing: 1.2 },
  bondTitle: { color: C.ink, ...D(700), fontSize: 22, marginTop: 2 },
  bondBody: { color: C.inkMuted, fontSize: 11, lineHeight: 17, marginTop: 3 },
  error: { color: C.clayText, fontSize: 12, lineHeight: 18, borderWidth: 1, borderColor: withAlpha(C.clay, 0.25), backgroundColor: withAlpha(C.clay, 0.06), borderRadius: 13, padding: 11 },
  saved: { color: C.greenText, fontSize: 12, lineHeight: 18, borderWidth: 1, borderColor: withAlpha(C.green, 0.28), backgroundColor: withAlpha(C.green, 0.06), borderRadius: 13, padding: 11 },
  submitButton: { minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: C.green, borderRadius: 999, paddingHorizontal: 20 },
  submitButtonText: { color: ON_GREEN, ...S(700), fontSize: 13 },
  submitNote: { color: C.inkFaint, fontSize: 10.5, lineHeight: 16, textAlign: "center", paddingHorizontal: 12 },
  gate: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.paper, padding: 28 },
  gateIcon: { width: 62, height: 62, alignItems: "center", justifyContent: "center", borderRadius: 21, backgroundColor: C.goldTint14, borderWidth: 1, borderColor: C.goldBorder35 },
  gateKicker: { color: C.goldText, ...S(700), fontSize: 9, letterSpacing: 1.8, marginTop: 18 },
  gateTitle: { color: C.ink, ...D(700), fontSize: 29, textAlign: "center", marginTop: 5 },
  gateBody: { color: C.inkMuted, fontSize: 13, lineHeight: 20, textAlign: "center", maxWidth: 315, marginTop: 8 },
  primaryButton: { minHeight: 48, alignItems: "center", justifyContent: "center", backgroundColor: C.green, borderRadius: 999, paddingHorizontal: 22, marginTop: 20 },
  primaryButtonText: { color: ON_GREEN, ...S(700), fontSize: 13 },
  textButton: { minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, marginTop: 6 },
  textButtonLabel: { color: C.greenText, ...S(700), fontSize: 12, textDecorationLine: "underline" },
});
