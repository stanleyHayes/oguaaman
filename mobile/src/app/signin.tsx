import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { T as Text, TI as TextInput } from "@/components/typography";
import { DateField } from "@/components/date-field";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import type { Plan } from "@/lib/types";
import { D, DI, ON_GREEN, withAlpha, type Palette, S } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { Mark } from "@/ui";
import { CheckIcon } from "@/components/icons";

// Latest allowed date of birth — Oguaa is 18+, mirroring the web Join form.
function adultCutoffIso() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const TRUST_SIGNIN = [
  "One account across web & mobile",
  "Free to use, built for the people of Oguaa",
];

const TRUST_JOIN = [
  ...TRUST_SIGNIN,
  "Your date of birth stays private — age check only",
];

type Mode = "signin" | "join";

const CREATOR_KINDS = [
  { id: "business", label: "Business owner" },
  { id: "property", label: "Realtor / property manager" },
  { id: "artist", label: "Artist" },
  { id: "organiser", label: "Event organiser" },
  { id: "writer", label: "Writer" },
  { id: "institution", label: "Institution" },
] as const;

const STARTER_FALLBACK: Plan = {
  id: "plan-starter-fallback",
  slug: "starter",
  name: "Starter",
  audience: "any",
  prices: { default: 0 },
  interval: "free",
  perks: ["1 live listing", "Standard directory placement"],
  maxListings: 1,
  active: true,
  sortOrder: 1,
};

type PlanCatalogStatus = "loading" | "ready" | "fallback" | "unavailable";

function creatorPlansFor(plans: Plan[], creatorTypes: string[]): Plan[] {
  const hasBusiness = creatorTypes.some((type) => type === "business" || type === "property");
  const hasNonBusinessCreator = creatorTypes.some((type) => type !== "business" && type !== "property");
  return plans
    .filter((plan) => {
      if (!plan.active) return false;
      if (plan.audience === "business") return hasBusiness;
      if (plan.audience === "creator") return hasNonBusinessCreator;
      return plan.audience === "any";
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function starterPlanFor(plans: Plan[]): Plan {
  return plans.find((plan) => plan.active && plan.slug === "starter" && plan.interval === "free" && (plan.prices.default ?? 0) === 0)
    ?? plans.find((plan) => plan.active && plan.interval === "free" && (plan.prices.default ?? 0) === 0)
    ?? STARTER_FALLBACK;
}

function planPrice(plan: Plan, creatorTypes: string[]): number {
  const audiencePrice = plan.audience === "creator"
    ? plan.prices.creator
    : creatorTypes.some((type) => type === "business" || type === "property")
      ? plan.prices.business
      : plan.prices.creator;
  return audiencePrice ?? plan.prices.default ?? 0;
}

function planPriceLabel(plan: Plan, creatorTypes: string[]): string {
  const price = planPrice(plan, creatorTypes);
  if (price === 0 || plan.interval === "free") return "Free";
  const cedis = price / 100;
  return `GH₵${Number.isInteger(cedis) ? cedis.toFixed(0) : cedis.toFixed(2)}/month`;
}

type FormState = {
  isJoin: boolean;
  asCreator: boolean;
  creatorStep: 1 | 2;
  creatorTypes: string[];
  plans: Plan[];
  selectedPlanSlug: string;
  planCatalogStatus: PlanCatalogStatus;
  name: string;
  identifier: string;
  dob: string;
  password: string;
  busy: boolean;
  err: string | null;
  onName: (v: string) => void;
  onIdentifier: (v: string) => void;
  onDob: (v: string) => void;
  onPassword: (v: string) => void;
  onSetAsCreator: (v: boolean) => void;
  onToggleCreatorType: (id: string) => void;
  onSelectPlan: (slug: string) => void;
  onCreatorBack: () => void;
  onSubmit: () => void;
  onSwitchMode: (m: Mode) => void;
};

function Hero({ isJoin, trust }: Readonly<{ isJoin: boolean; trust: string[] }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={s.hero}>
      <View style={s.heroMark}><Mark size={44} color={C.gold} /></View>
      <Text style={s.heroKicker}>{isJoin ? "Join Oguaa" : "Member sign in"}</Text>
      <Text style={s.heroTitle}>Welcome home to Oguaa.</Text>
      <Text style={s.heroSub}>
        {isJoin
          ? "Create your account with a phone or email and a password — one account for the whole of Oguaa."
          : "Sign in with your phone or email and your password — one account across web & mobile."}
      </Text>
      <View style={{ marginTop: 16, gap: 8 }}>
        {trust.map((t) => (
          <View key={t} style={s.trustRow}>
            <View style={s.trustTick}><CheckIcon size={12} color={C.cream} strokeWidth={3} /></View>
            <Text style={s.trustText}>{t}</Text>
          </View>
        ))}
      </View>
      <Text style={s.motto}>Yɛn ara asaase ni — this is our own land.</Text>
    </View>
  );
}

function AccountTypeSelection({
  asCreator,
  creatorTypes,
  onSetAsCreator,
  onToggleCreatorType,
}: Readonly<{
  asCreator: boolean;
  creatorTypes: string[];
  onSetAsCreator: (v: boolean) => void;
  onToggleCreatorType: (id: string) => void;
}>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={s.accountBlock}>
      <Text style={s.label}>I’m joining as</Text>
      <View style={s.accountChoices}>
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ checked: !asCreator }}
          onPress={() => onSetAsCreator(false)}
          style={[s.accountChoice, !asCreator && s.accountChoiceOn]}
        >
          <Text style={s.accountChoiceTitle}>A citizen</Text>
          <Text style={s.accountChoiceCopy}>Memories, school ties and community</Text>
        </Pressable>
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ checked: asCreator }}
          onPress={() => onSetAsCreator(true)}
          style={[s.accountChoice, asCreator && s.accountChoiceOn]}
        >
          <Text style={s.accountChoiceTitle}>A creator</Text>
          <Text style={s.accountChoiceCopy}>Listings, promotions and a studio</Text>
        </Pressable>
      </View>
      {asCreator && (
        <View style={s.creatorKinds}>
          <Text style={s.label}>What do you create? <Text style={s.labelAside}>Pick all that apply</Text></Text>
          <View style={s.chipRow}>
            {CREATOR_KINDS.map((kind) => {
              const selected = creatorTypes.includes(kind.id);
              return (
                <Pressable
                  key={kind.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  onPress={() => onToggleCreatorType(kind.id)}
                  style={[s.creatorChip, selected && s.creatorChipOn]}
                >
                  <Text style={[s.creatorChipText, selected && s.creatorChipTextOn]}>{kind.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={s.creatorHint}>Creators get a studio to publish work, promote listings and manage a plan.</Text>
        </View>
      )}
    </View>
  );
}

function PlanSelection({
  plans,
  creatorTypes,
  selectedSlug,
  status,
  onSelect,
}: Readonly<{
  plans: Plan[];
  creatorTypes: string[];
  selectedSlug: string;
  status: PlanCatalogStatus;
  onSelect: (slug: string) => void;
}>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={s.planBlock}>
      <View style={s.stepHeader}>
        <Text style={s.stepEyebrow}>Step 2 of 2</Text>
        <Text style={s.planHeading}>Choose your starting plan</Text>
        <Text style={s.planIntro}>Starter is free by default. You can change your preference later in Creator Studio.</Text>
      </View>
      {(status === "ready" || status === "fallback") && plans.map((plan) => {
          const selected = plan.slug === selectedSlug;
          return (
            <Pressable
              key={plan.slug}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${plan.name}, ${planPriceLabel(plan, creatorTypes)}`}
              onPress={() => onSelect(plan.slug)}
              style={[s.planCard, selected && s.planCardOn]}
            >
              <View style={s.planTopline}>
                <View style={s.planNameRow}>
                  <Text style={s.planName}>{plan.name}</Text>
                  {plan.slug === "starter" && <Text style={s.defaultBadge}>Default</Text>}
                </View>
                <View style={[s.radio, selected && s.radioOn]}>
                  {selected && <View style={s.radioDot} />}
                </View>
              </View>
              <Text style={s.planPrice}>{planPriceLabel(plan, creatorTypes)}</Text>
              {plan.perks.slice(0, 4).map((perk) => (
                <View key={perk} style={s.perkRow}>
                  <CheckIcon size={13} color={C.goldText} strokeWidth={2.5} />
                  <Text style={s.perkText}>{perk}</Text>
                </View>
              ))}
            </Pressable>
          );
        })}
      {status === "loading" && (
        <View accessibilityRole="progressbar" style={s.catalogNote}>
          <Text style={s.catalogNoteText}>Loading live plan options…</Text>
        </View>
      )}
      {status === "fallback" && (
        <View accessibilityRole="alert" style={s.catalogNote}>
          <Text style={s.catalogNoteText}>The live catalog could not be loaded. Starter is shown as the safe default and signup will verify it.</Text>
        </View>
      )}
      {status === "unavailable" && (
        <View accessibilityRole="alert" style={s.catalogError}>
          <Text style={s.catalogErrorText}>No free creator plan is available right now. Please try again shortly.</Text>
        </View>
      )}
      <View style={s.intentNote}>
        <Text style={s.intentNoteText}>A paid choice only saves your preference. There is no charge during signup; payment and benefits activate later through an eligible approved business listing.</Text>
      </View>
    </View>
  );
}

function FormCard(f: Readonly<FormState>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [showPw, setShowPw] = useState(false);
  const planStep = f.isJoin && f.asCreator && f.creatorStep === 2;
  let btnLabel = "Sign in";
  if (f.busy) btnLabel = f.isJoin ? "Creating…" : "Signing in…";
  else if (f.isJoin && f.asCreator && f.creatorStep === 1) btnLabel = "Choose a plan →";
  else if (f.isJoin) btnLabel = "Create my account →";
  return (
    <View style={s.card}>
      <View style={s.tabs}>
        <Pressable accessibilityRole="button" onPress={() => f.onSwitchMode("signin")} style={[s.tab, !f.isJoin && s.tabOn]}>
          <Text style={[s.tabText, !f.isJoin && s.tabTextOn]}>Sign in</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => f.onSwitchMode("join")} style={[s.tab, f.isJoin && s.tabOn]}>
          <Text style={[s.tabText, f.isJoin && s.tabTextOn]}>Join</Text>
        </Pressable>
      </View>

      <Text style={s.cardTitle}>{f.isJoin ? "Join Oguaa" : "Sign in"}</Text>
      <Text style={s.cardSub}>
        {f.isJoin ? "Create your account — one password for web & mobile." : "Enter your phone or email and your password."}
      </Text>

      {planStep ? (
        <PlanSelection
          plans={f.plans}
          creatorTypes={f.creatorTypes}
          selectedSlug={f.selectedPlanSlug}
          status={f.planCatalogStatus}
          onSelect={f.onSelectPlan}
        />
      ) : (
        <>
          {f.isJoin && (
            <>
              <AccountTypeSelection
                asCreator={f.asCreator}
                creatorTypes={f.creatorTypes}
                onSetAsCreator={f.onSetAsCreator}
                onToggleCreatorType={f.onToggleCreatorType}
              />
              <Text style={s.label}>Your name</Text>
              <TextInput value={f.name} onChangeText={f.onName} placeholder="Display name" placeholderTextColor={C.inkFaint} autoComplete="name" style={s.input} />
            </>
          )}
          <Text style={s.label}>Phone or email</Text>
          <TextInput value={f.identifier} onChangeText={f.onIdentifier} placeholder="+233… or you@email" placeholderTextColor={C.inkFaint} autoCapitalize="none" autoComplete="username" style={s.input} />
          {f.isJoin && (
            <>
              <Text style={s.label}>Date of birth</Text>
              <DateField value={f.dob} onChange={f.onDob} placeholder="Your date of birth" maxDate={adultCutoffIso()} />
              <Text style={s.hint}>Oguaa is for ages 18 and over.</Text>
            </>
          )}
          <Text style={s.label}>Password</Text>
          <View style={s.pwRow}>
            <TextInput
              value={f.password}
              onChangeText={f.onPassword}
              placeholder={f.isJoin ? "Choose a password" : "Your password"}
              placeholderTextColor={C.inkFaint}
              secureTextEntry={!showPw}
              autoCapitalize="none"
              autoComplete={f.isJoin ? "new-password" : "password"}
              textContentType={f.isJoin ? "newPassword" : "password"}
              style={s.pwInput}
            />
            <Pressable
              onPress={() => setShowPw((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={showPw ? "Hide password" : "Show password"}
              hitSlop={8}
              style={s.pwToggle}
            >
              <Text style={s.pwToggleText}>{showPw ? "Hide" : "Show"}</Text>
            </Pressable>
          </View>
          {f.isJoin && <Text style={s.hint}>At least 8 characters</Text>}
        </>
      )}

      {f.err && <Text style={s.err}>{f.err}</Text>}
      <View style={s.actionRow}>
        {planStep && (
          <Pressable accessibilityRole="button" onPress={f.onCreatorBack} style={s.backBtn}>
            <Text style={s.backBtnText}>← Back</Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          onPress={f.onSubmit}
          disabled={f.busy || (planStep && (f.planCatalogStatus === "loading" || f.planCatalogStatus === "unavailable"))}
          style={[s.btn, s.actionPrimary, (f.busy || (planStep && (f.planCatalogStatus === "loading" || f.planCatalogStatus === "unavailable"))) && s.btnDisabled]}
        >
          <Text style={s.btnText}>{btnLabel}</Text>
        </Pressable>
      </View>
      <Pressable accessibilityRole="button" onPress={() => f.onSwitchMode(f.isJoin ? "signin" : "join")}>
        <Text style={s.back}>{f.isJoin ? "Have an account? Sign in instead" : "New here? Join instead"}</Text>
      </Pressable>
    </View>
  );
}

export default function SignIn() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { signIn, completeMfa, join } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [identifier, setIdentifier] = useState("");
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [asCreator, setAsCreator] = useState(false);
  const [creatorStep, setCreatorStep] = useState<1 | 2>(1);
  const [creatorTypes, setCreatorTypes] = useState<string[]>([]);
  const [planCatalog, setPlanCatalog] = useState<Plan[]>([STARTER_FALLBACK]);
  const [planCatalogStatus, setPlanCatalogStatus] = useState<PlanCatalogStatus>("loading");
  const [creatorPlanIntent, setCreatorPlanIntent] = useState(STARTER_FALLBACK.slug);
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isJoin = mode === "join";
  const availableCreatorPlans = creatorPlansFor(planCatalog, creatorTypes);
  const selectedCreatorPlan = availableCreatorPlans.find((plan) => plan.slug === creatorPlanIntent)
    ?? starterPlanFor(availableCreatorPlans);
  const hasEligibleFreePlan = availableCreatorPlans.some(
    (plan) => plan.interval === "free" && planPrice(plan, creatorTypes) === 0,
  );
  const effectivePlanStatus: PlanCatalogStatus = planCatalogStatus === "ready" && !hasEligibleFreePlan
    ? "unavailable"
    : planCatalogStatus;

  useEffect(() => {
    let current = true;
    api.plans()
      .then((rows) => {
        if (!current) return;
        const active = rows.filter((plan) => plan.active);
        const hasFreePlan = active.some(
          (plan) => plan.interval === "free" && (plan.prices.default ?? 0) === 0,
        );
        const nextCatalog = hasFreePlan ? active : [];
        setPlanCatalog(nextCatalog);
        setCreatorPlanIntent(starterPlanFor(nextCatalog).slug);
        setPlanCatalogStatus(hasFreePlan ? "ready" : "unavailable");
      })
      .catch(() => {
        if (!current) return;
        setPlanCatalog([STARTER_FALLBACK]);
        setCreatorPlanIntent(STARTER_FALLBACK.slug);
        setPlanCatalogStatus("fallback");
      });
    return () => { current = false; };
  }, []);

  function toggleCreatorType(id: string) {
    const nextTypes = creatorTypes.includes(id)
      ? creatorTypes.filter((type) => type !== id)
      : [...creatorTypes, id];
    const nextPlans = creatorPlansFor(planCatalog, nextTypes);
    setCreatorTypes(nextTypes);
    if (!nextPlans.some((plan) => plan.slug === creatorPlanIntent)) {
      setCreatorPlanIntent(starterPlanFor(nextPlans).slug);
    }
  }

  function switchMode(m: Mode) {
    setMode(m);
    setErr(null);
    setChallenge(null);
    setCreatorStep(1);
  }

  async function submit() {
    setErr(null);
    if (isJoin && creatorStep === 1) {
      if (asCreator && creatorTypes.length === 0) { setErr("Pick at least one creator type."); return; }
      if (!name.trim()) { setErr("Please enter your name."); return; }
      if (!identifier.trim()) { setErr("Please enter your phone or email."); return; }
      if (!dob.trim()) { setErr("Please enter your date of birth."); return; }
      if (password.length < 8) { setErr("Your password must be at least 8 characters."); return; }
      if (asCreator) { setCreatorStep(2); return; }
    }
    if (isJoin && asCreator) {
      if (effectivePlanStatus === "unavailable") { setErr("No free creator plan is available right now. Please try again shortly."); return; }
      if (!availableCreatorPlans.some((plan) => plan.slug === selectedCreatorPlan.slug)) {
        setErr("Choose an available creator plan to continue.");
        return;
      }
    }
    setBusy(true);
    try {
      if (isJoin) {
        await join({
          identifier: identifier.trim(),
          displayName: name.trim(),
          dateOfBirth: dob.trim(),
          password,
          ...(asCreator ? {
            creatorTypes,
            creatorPlanIntent: selectedCreatorPlan.slug,
          } : {}),
        });
        router.back();
      } else {
        const res = await signIn(identifier.trim(), password);
        if (res.mfaRequired && res.challenge) { setChallenge(res.challenge); setCode(""); }
        else router.back();
      }
    } catch (e) {
      const fallback = isJoin ? "Could not create your account." : "Sign in failed.";
      setErr(e instanceof Error ? e.message : fallback);
    } finally { setBusy(false); }
  }

  async function submitCode() {
    if (!challenge) return;
    setBusy(true); setErr(null);
    try {
      await completeMfa(challenge, code.trim());
      router.back();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That code didn't work.");
    } finally { setBusy(false); }
  }

  if (challenge) {
    return (
      <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Hero isJoin={false} trust={TRUST_SIGNIN} />
        <View style={s.card}>
          <Text style={s.cardTitle}>Two-factor check</Text>
          <Text style={s.cardSub}>Enter the 6-digit code from your authenticator app, or a recovery code.</Text>
          <Text style={s.label}>Code</Text>
          <TextInput
            style={[s.input, { textAlign: "center", letterSpacing: 4, fontSize: 18 }]}
            value={code}
            onChangeText={setCode}
            placeholder="123 456"
            placeholderTextColor={C.inkFaint}
            keyboardType="number-pad"
            autoComplete="one-time-code"
          />
          {err ? <Text style={s.err}>{err}</Text> : null}
          <Pressable accessibilityRole="button" style={[s.btn, busy && { opacity: 0.6 }]} onPress={submitCode} disabled={busy}>
            <Text style={s.btnText}>{busy ? "Verifying…" : "Verify & sign in"}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => { setChallenge(null); setErr(null); setPassword(""); }}>
            <Text style={s.back}>← Back to sign in</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Hero isJoin={isJoin} trust={isJoin ? TRUST_JOIN : TRUST_SIGNIN} />
      <FormCard
        isJoin={isJoin}
        asCreator={asCreator}
        creatorStep={creatorStep}
        creatorTypes={creatorTypes}
        plans={availableCreatorPlans}
        selectedPlanSlug={selectedCreatorPlan.slug}
        planCatalogStatus={effectivePlanStatus}
        name={name}
        identifier={identifier}
        dob={dob}
        password={password}
        busy={busy}
        err={err}
        onName={setName}
        onIdentifier={setIdentifier}
        onDob={setDob}
        onPassword={setPassword}
        onSetAsCreator={(next) => { setAsCreator(next); setErr(null); }}
        onToggleCreatorType={toggleCreatorType}
        onSelectPlan={setCreatorPlanIntent}
        onCreatorBack={() => { setCreatorStep(1); setErr(null); }}
        onSubmit={submit}
        onSwitchMode={switchMode}
      />
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  hero: { backgroundColor: C.green, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 44, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  heroMark: { alignItems: "center", marginBottom: 14 },
  heroKicker: { color: C.gold, fontSize: 11, ...D(700), letterSpacing: 2, textTransform: "uppercase", textAlign: "center" },
  heroTitle: { ...D(600), color: ON_GREEN, fontSize: 30, textAlign: "center", marginTop: 8 },
  // #D9D2C2 / #E7E1D3: bespoke light inks on the green hero, which stays dark
  // in both themes — no palette token matches, so they are kept as literals.
  heroSub: { color: withAlpha(ON_GREEN, 0.78), fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 8 },
  trustRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  trustTick: { width: 20, height: 20, borderRadius: 10, backgroundColor: withAlpha(C.gold, 0.2), alignItems: "center", justifyContent: "center", marginTop: 1 },
  trustTickText: { color: C.gold, fontSize: 11, ...S(700) },
  trustText: { color: withAlpha(ON_GREEN, 0.85), fontSize: 13, lineHeight: 19, flex: 1 },
  motto: { ...DI(), color: C.gold, fontSize: 14, textAlign: "center", marginTop: 18 },
  card: { marginHorizontal: 16, marginTop: -24, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 16, padding: 20, gap: 14, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  tabs: { flexDirection: "row", gap: 8, marginBottom: 4 },
  tab: { flex: 1, alignItems: "center", borderWidth: 1, borderColor: C.sand, backgroundColor: C.cream, borderRadius: 999, paddingVertical: 9 },
  tabOn: { borderColor: C.green, backgroundColor: C.green },
  tabText: { color: C.inkMuted, fontSize: 14, ...S(600) },
  tabTextOn: { color: ON_GREEN },
  cardTitle: { ...D(600), fontSize: 24, color: C.ink },
  cardSub: { color: C.inkMuted, fontSize: 13, lineHeight: 19, marginTop: -8 },
  label: { color: C.ink, fontSize: 13, ...S(600), marginBottom: -8 },
  labelAside: { color: C.inkFaint, fontSize: 12, ...S(400) },
  accountBlock: { gap: 14 },
  accountChoices: { flexDirection: "row", gap: 8 },
  accountChoice: { flex: 1, minHeight: 84, borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 14, padding: 12 },
  accountChoiceOn: { borderColor: C.green, backgroundColor: withAlpha(C.green, 0.08) },
  accountChoiceTitle: { color: C.ink, fontSize: 14, ...S(700) },
  accountChoiceCopy: { color: C.inkFaint, fontSize: 11, lineHeight: 16, marginTop: 4 },
  creatorKinds: { gap: 12 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  creatorChip: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8 },
  creatorChipOn: { borderColor: C.green, backgroundColor: C.green },
  creatorChipText: { color: C.inkMuted, fontSize: 12, ...S(600) },
  creatorChipTextOn: { color: ON_GREEN },
  creatorHint: { color: C.inkFaint, fontSize: 12, lineHeight: 17 },
  planBlock: { gap: 10 },
  stepHeader: { gap: 5, marginBottom: 2 },
  stepEyebrow: { color: C.goldText, fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase", ...S(700) },
  planHeading: { color: C.ink, fontSize: 20, ...D(600) },
  planIntro: { color: C.inkMuted, fontSize: 12, lineHeight: 18 },
  planCard: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 16, padding: 15 },
  planCardOn: { borderColor: C.green, backgroundColor: withAlpha(C.green, 0.07) },
  planTopline: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  planNameRow: { flex: 1, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 7 },
  planName: { color: C.ink, fontSize: 15, ...S(700) },
  defaultBadge: { color: C.greenText, backgroundColor: withAlpha(C.green, 0.1), borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3, fontSize: 9, textTransform: "uppercase", letterSpacing: 0.6, ...S(700) },
  radio: { width: 21, height: 21, borderRadius: 11, borderWidth: 1, borderColor: C.inkFaint, backgroundColor: C.cream, alignItems: "center", justifyContent: "center" },
  radioOn: { borderColor: C.green, backgroundColor: C.green },
  radioDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: ON_GREEN },
  planPrice: { color: C.greenText, fontSize: 17, marginTop: 4, marginBottom: 8, ...S(700) },
  perkRow: { flexDirection: "row", alignItems: "flex-start", gap: 7, marginTop: 4 },
  perkText: { flex: 1, color: C.inkMuted, fontSize: 12, lineHeight: 17 },
  catalogNote: { borderWidth: 1, borderColor: C.goldBorder35, backgroundColor: C.goldTint14, borderRadius: 12, padding: 11 },
  catalogNoteText: { color: C.inkMuted, fontSize: 12, lineHeight: 17 },
  catalogError: { borderWidth: 1, borderColor: withAlpha(C.clay, 0.3), backgroundColor: C.clayTint, borderRadius: 12, padding: 11 },
  catalogErrorText: { color: C.clayText, fontSize: 12, lineHeight: 17 },
  intentNote: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.cream, borderRadius: 12, padding: 11 },
  intentNoteText: { color: C.inkMuted, fontSize: 12, lineHeight: 18 },
  input: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, color: C.ink },
  pwRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 12 },
  pwInput: { flex: 1, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, color: C.ink },
  pwToggle: { paddingHorizontal: 14, paddingVertical: 13 },
  pwToggleText: { color: C.inkMuted, fontSize: 13, ...S(700) },
  btn: { backgroundColor: C.green, borderRadius: 999, paddingVertical: 15, alignItems: "center" },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: ON_GREEN, ...S(700), fontSize: 15 },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  actionPrimary: { flex: 1 },
  backBtn: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 14 },
  backBtnText: { color: C.inkMuted, fontSize: 13, ...S(700) },
  err: { color: C.clayText, fontSize: 14, backgroundColor: C.clayTint, borderWidth: 1, borderColor: withAlpha(C.clay, 0.3), borderRadius: 10, padding: 10 },
  hint: { color: C.inkFaint, fontSize: 12, textAlign: "center" },
  back: { color: C.inkMuted, textAlign: "center", paddingVertical: 8 },
});
