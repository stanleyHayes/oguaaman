import { useMemo, useState, type ReactNode } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { T as Text } from "@/components/typography";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { usePledge } from "@/lib/civic";
import { useTheme } from "@/lib/theme-context";
import type { CivicBehaviour, CivicData, CivicLesson, CivicRing, Goal, GoalStatus } from "@/lib/types";
import { D, S, SI, ON_GREEN, withAlpha, type Palette } from "@/theme";
import { Loading, ErrorView } from "@/ui";
import { EmptyState } from "@/components/empty-state";
import { RevealView, StaggerIn } from "@/components/anim";
import {
  BanIcon, BriefcaseIcon, CheckIcon, ChevronDownIcon, ChevronUpIcon, CrabIcon,
  FlagIcon, GradCapIcon, HandsIcon, HomeIcon, UserIcon,
} from "@/components/icons";

// ── Build a better Oguaa — the civic hub (/better) ──────────────────────────
// "The civic revolution": the small daily behaviours that make a great town,
// grouped by the ring of life they touch, framed by the civilizations whose
// civic habits made them great. Data comes live from GET /api/civic; the pledge
// is kept privately on the resident's own device (see @/lib/civic).

// The six rings of civic life, in the order they widen from the self outward.
const RING_ORDER: CivicRing[] = ["self", "home", "school", "work", "town", "nation"];

const RING_META: Record<CivicRing, { label: string; fante?: string; blurb: string }> = {
  self: { label: "Self", blurb: "It begins with you — the person you are when no one is watching." },
  home: { label: "Home", blurb: "The first republic — how we live with family, tenants and neighbours." },
  school: { label: "School", blurb: "The Citadel of Education — habits carried from the classroom into life." },
  work: { label: "Work", blurb: "The working city — markets, offices and trade done with pride." },
  town: { label: "Town", fante: "Oguaa", blurb: "Cape Coast civic life — the shore, the markets, the queue, the elders." },
  nation: { label: "Nation", blurb: "One Ghana — the town's habits scaled up to a country." },
};

/** A theme-aware accent per ring (never a hardcoded hex). */
function ringAccent(C: Palette, ring: CivicRing): string {
  switch (ring) {
    case "self": return C.green;
    case "home": return C.goldBrand;
    case "school": return C.maroon;
    case "work": return C.teal;
    case "town": return C.clay;
    case "nation": return C.green;
  }
}

function RingIcon({ ring, size, color }: Readonly<{ ring: CivicRing; size: number; color: string }>) {
  const p = { size, color, strokeWidth: 2 } as const;
  switch (ring) {
    case "self": return <UserIcon {...p} />;
    case "home": return <HomeIcon {...p} />;
    case "school": return <GradCapIcon {...p} />;
    case "work": return <BriefcaseIcon {...p} />;
    case "town": return <CrabIcon {...p} />;
    case "nation": return <FlagIcon {...p} />;
  }
}

/** The do/stop mark — a green check or a clay prohibition slash on a soft tint. */
function DoStopGlyph({ type, size = 18 }: Readonly<{ type: "do" | "stop"; size?: number }>) {
  const { C } = useTheme();
  const isDo = type === "do";
  const box = size + 12;
  return (
    <View
      style={{
        width: box, height: box, borderRadius: box / 2, alignItems: "center", justifyContent: "center",
        backgroundColor: withAlpha(isDo ? C.green : C.clay, 0.12),
      }}
    >
      {isDo ? <CheckIcon size={size} color={C.greenText} strokeWidth={2.6} /> : <BanIcon size={size} color={C.clayText} strokeWidth={2.4} />}
    </View>
  );
}

/** One behaviour: title + description, with the `why` revealed on tap. */
function BehaviourCard({ b, index }: Readonly<{ b: CivicBehaviour; index: number }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [open, setOpen] = useState(false);
  const isDo = b.type === "do";
  const accent = isDo ? C.green : C.clay;
  return (
    <StaggerIn index={index} style={[s.behaviourCard, { borderColor: withAlpha(accent, 0.3) }]}>
      <View style={s.behaviourHead}>
        <DoStopGlyph type={b.type} />
        <Text style={s.behaviourTitle}>{b.title}</Text>
      </View>
      <Text style={s.behaviourDesc}>{b.description}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        hitSlop={6}
        style={s.whyToggle}
      >
        <Text style={[s.whyToggleText, { color: isDo ? C.greenText : C.clayText }]}>Why it matters</Text>
        {open
          ? <ChevronUpIcon size={14} color={isDo ? C.greenText : C.clayText} strokeWidth={2.5} />
          : <ChevronDownIcon size={14} color={isDo ? C.greenText : C.clayText} strokeWidth={2.5} />}
      </Pressable>
      {open ? (
        <View style={[s.whyBody, { borderLeftColor: withAlpha(accent, 0.45) }]}>
          <Text style={s.whyText}>{b.why}</Text>
        </View>
      ) : null}
    </StaggerIn>
  );
}

function BehaviourGroup({ type, items }: Readonly<{ type: "do" | "stop"; items: CivicBehaviour[] }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  if (items.length === 0) return null;
  const isDo = type === "do";
  return (
    <View style={{ gap: 10 }}>
      <View style={s.groupHead}>
        <DoStopGlyph type={type} size={13} />
        <Text style={[s.groupLabel, { color: isDo ? C.greenText : C.clayText }]}>{isDo ? "Do this" : "Stop this"}</Text>
      </View>
      {items.map((b, i) => <BehaviourCard key={b.slug} b={b} index={i} />)}
    </View>
  );
}

function CivilizationCard({ c, index }: Readonly<{ c: CivicLesson; index: number }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <StaggerIn index={index} style={s.civCard}>
      <Text style={s.civEra}>{c.era}</Text>
      <Text style={s.civName}>{c.name}</Text>
      <Text style={s.civPrinciple}>{c.principle}</Text>
      <Text style={s.civLesson}>{c.lesson}</Text>
    </StaggerIn>
  );
}

/** A single pledge row — a real, accessible checkbox wrapping the behaviour. */
function PledgeItem({ b, checked, onToggle }: Readonly<{ b: CivicBehaviour; checked: boolean; onToggle: () => void }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const isDo = b.type === "do";
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={`${isDo ? "Do" : "Stop"}: ${b.title}`}
      onPress={onToggle}
      style={[s.pledgeRow, checked && { borderColor: withAlpha(C.green, 0.6), backgroundColor: withAlpha(C.green, 0.06) }]}
    >
      <View style={[s.checkbox, checked ? { backgroundColor: C.green, borderColor: C.green } : { borderColor: C.sand }]}>
        {checked ? <CheckIcon size={14} color={ON_GREEN} strokeWidth={3} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={[s.pledgeChip, { backgroundColor: withAlpha(isDo ? C.green : C.clay, 0.12) }]}>
          {isDo ? <CheckIcon size={11} color={C.greenText} strokeWidth={3} /> : <BanIcon size={11} color={C.clayText} strokeWidth={2.4} />}
          <Text style={[s.pledgeChipText, { color: isDo ? C.greenText : C.clayText }]}>{isDo ? "DO" : "STOP"}</Text>
        </View>
        <Text style={s.pledgeTitle}>{b.title}</Text>
      </View>
    </Pressable>
  );
}

function RingHeader({ ring }: Readonly<{ ring: CivicRing }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const meta = RING_META[ring];
  const accent = ringAccent(C, ring);
  return (
    <View style={s.ringHead}>
      <View style={s.ringIconWrap}>
        <RingIcon ring={ring} size={24} color={C.goldText} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.ringLabel}>
          {meta.label}
          {meta.fante ? <Text style={s.ringFante}>  {meta.fante}</Text> : null}
        </Text>
        <View style={[s.ringAccent, { backgroundColor: accent }]} />
        <Text style={s.ringBlurb}>{meta.blurb}</Text>
      </View>
    </View>
  );
}

function Kicker({ children }: Readonly<{ children: ReactNode }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return <Text style={s.sectionKicker}>{children}</Text>;
}

// ── Town goals (civic accountability) ────────────────────────────────────────

const GOAL_CADENCE_LABEL: Record<Goal["cadence"], string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  semiannual: "Half-year",
  annual: "Annual",
};

function goalStatusMeta(C: Palette, status: GoalStatus): { label: string; fg: string; bg: string } {
  switch (status) {
    case "achieved":
      return { label: "Achieved", fg: C.greenText, bg: withAlpha(C.green, 0.14) };
    case "missed":
      return { label: "Missed", fg: C.clayText, bg: withAlpha(C.clay, 0.14) };
    case "pending_review":
      return { label: "Awaiting review", fg: C.goldText, bg: withAlpha(C.gold, 0.2) };
    default:
      return { label: "In progress", fg: C.greenText, bg: withAlpha(C.green, 0.14) };
  }
}

function GoalChip({ status }: Readonly<{ status: GoalStatus }>) {
  const { C } = useTheme();
  const m = goalStatusMeta(C, status);
  return (
    <View style={{ alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: m.bg }}>
      <Text style={{ fontSize: 11, color: m.fg, ...S(700) }}>{m.label}</Text>
    </View>
  );
}

function GoalCard({ g }: Readonly<{ g: Goal }>) {
  const { C } = useTheme();
  const gs = useMemo(() => makeGoalStyles(C), [C]);
  return (
    <View style={gs.card}>
      <View style={gs.cardTop}>
        <Text style={gs.cadence}>{GOAL_CADENCE_LABEL[g.cadence]} · {g.periodLabel}</Text>
        <GoalChip status={g.status} />
      </View>
      <Text style={gs.cardTitle}>{g.title}</Text>
      <Text style={gs.cardDesc}>{g.description}</Text>
      {g.target ? (
        <Text style={gs.cardTarget}><Text style={S(700)}>Target — </Text>{g.target}</Text>
      ) : null}
    </View>
  );
}

function RecordCard({ g }: Readonly<{ g: Goal }>) {
  const { C } = useTheme();
  const gs = useMemo(() => makeGoalStyles(C), [C]);
  const achieved = g.status === "achieved";
  const accent = achieved ? C.green : C.clay;
  return (
    <View style={[gs.card, { borderColor: withAlpha(accent, 0.3), backgroundColor: withAlpha(accent, 0.05) }]}>
      <View style={gs.cardTop}>
        <Text style={gs.cadence}>{GOAL_CADENCE_LABEL[g.cadence]} · {g.periodLabel}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {achieved ? <CheckIcon size={14} color={C.greenText} strokeWidth={3} /> : <BanIcon size={14} color={C.clayText} strokeWidth={2.4} />}
          <GoalChip status={g.status} />
        </View>
      </View>
      <Text style={gs.cardTitle}>{g.title}</Text>
      {g.reviewNote ? <Text style={gs.recordNote}>“{g.reviewNote}”</Text> : null}
      {g.reviewedByName ? <Text style={gs.recordBy}>Judged by {g.reviewedByName}</Text> : null}
    </View>
  );
}

function GoalsSection({ goals }: Readonly<{ goals: Goal[] }>) {
  const { C } = useTheme();
  const gs = useMemo(() => makeGoalStyles(C), [C]);
  if (goals.length === 0) return null;
  const featured =
    goals.find((g) => g.featured) ??
    goals.find((g) => g.cadence === "annual" && (g.status === "active" || g.status === "pending_review"));
  const current = goals.filter((g) => g !== featured && (g.status === "active" || g.status === "pending_review"));
  const record = goals.filter((g) => g.status === "achieved" || g.status === "missed");

  return (
    <View style={gs.section}>
      <Kicker>THE TOWN&apos;S GOALS</Kicker>
      <Text style={gs.title}>What Oguaa is holding itself to</Text>
      <Text style={gs.lede}>
        Set together, shown to remind everyone, and judged honestly — kept or missed — by an accountability officer.
      </Text>

      {featured ? (
        <View style={gs.featured}>
          <Text style={gs.featuredKicker}>OGUAA&apos;S GOAL FOR {featured.periodLabel.toUpperCase()}</Text>
          <Text style={gs.featuredTitle}>{featured.title}</Text>
          <Text style={gs.featuredDesc}>{featured.description}</Text>
          {featured.target ? (
            <Text style={gs.featuredTarget}><Text style={{ color: C.gold, ...S(700) }}>The target — </Text>{featured.target}</Text>
          ) : null}
          {featured.setAtDurbar ? (
            <Text style={gs.durbar}>Set at the grand durbar · judged at the next Fetu Afahye.</Text>
          ) : null}
          <View style={gs.featuredChip}>
            <Text style={gs.featuredChipText}>{goalStatusMeta(C, featured.status).label}</Text>
          </View>
        </View>
      ) : null}

      {current.length > 0 ? (
        <View style={{ marginTop: 18, gap: 10 }}>
          <Text style={gs.subhead}>IN PROGRESS NOW</Text>
          {current.map((g) => <GoalCard key={g.id} g={g} />)}
        </View>
      ) : null}

      {record.length > 0 ? (
        <View style={{ marginTop: 18, gap: 10 }}>
          <Text style={gs.subhead}>THE RECORD — KEPT &amp; MISSED</Text>
          {record.map((g) => <RecordCard key={g.id} g={g} />)}
        </View>
      ) : null}
    </View>
  );
}

const makeGoalStyles = (C: Palette) => StyleSheet.create({
  section: { paddingHorizontal: 20, paddingTop: 28 },
  title: { fontSize: 22, color: C.ink, marginTop: 4, ...D(700) },
  lede: { fontSize: 14, lineHeight: 21, color: C.inkMuted, marginTop: 6 },
  featured: { marginTop: 16, borderRadius: 20, padding: 20, backgroundColor: C.green },
  featuredKicker: { fontSize: 11, letterSpacing: 1.2, color: C.gold, ...S(700) },
  featuredTitle: { fontSize: 20, color: ON_GREEN, marginTop: 6, ...D(600) },
  featuredDesc: { fontSize: 14, lineHeight: 21, color: withAlpha(ON_GREEN, 0.85), marginTop: 8 },
  featuredTarget: { fontSize: 13, lineHeight: 20, color: ON_GREEN, marginTop: 12, backgroundColor: withAlpha(ON_GREEN, 0.1), borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, overflow: "hidden" },
  durbar: { fontSize: 12, color: withAlpha(ON_GREEN, 0.7), marginTop: 10 },
  featuredChip: { alignSelf: "flex-start", marginTop: 14, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, backgroundColor: withAlpha(ON_GREEN, 0.16) },
  featuredChipText: { fontSize: 11, color: ON_GREEN, ...S(700) },
  subhead: { fontSize: 12, letterSpacing: 1, color: C.inkMuted, ...S(700) },
  card: { borderRadius: 16, borderWidth: 1, borderColor: withAlpha(C.green, 0.12), backgroundColor: C.paper, padding: 16 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cadence: { fontSize: 11, letterSpacing: 0.8, color: C.goldText, textTransform: "uppercase", flexShrink: 1, ...S(700) },
  cardTitle: { fontSize: 16, color: C.ink, marginTop: 8, ...S(700) },
  cardDesc: { fontSize: 13, lineHeight: 20, color: C.inkMuted, marginTop: 4 },
  cardTarget: { fontSize: 12, lineHeight: 18, color: C.inkMuted, marginTop: 8 },
  recordNote: { fontSize: 13, lineHeight: 20, color: C.inkMuted, marginTop: 6, ...SI() },
  recordBy: { fontSize: 12, color: C.goldText, marginTop: 8 },
});

export default function Better() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { data, error, loading, refreshing, reload } = useApi<CivicData>(() => api.civic(), "civic");
  const goalsQuery = useApi<Goal[]>(() => api.goals(), "goals");
  const { pledged, toggle, clear } = usePledge();

  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "No data"} />;

  const { behaviors, civilizations } = data;

  // Group behaviours by ring, preserving the widening ring order.
  const byRing = new Map<CivicRing, CivicBehaviour[]>();
  for (const b of behaviors) byRing.set(b.ring, [...(byRing.get(b.ring) ?? []), b]);
  const rings = RING_ORDER.filter((r) => byRing.has(r));

  const doCount = behaviors.filter((b) => b.type === "do").length;
  const stopCount = behaviors.filter((b) => b.type === "stop").length;
  // Count only pledges that still exist in the current catalogue.
  const pledgeCount = behaviors.reduce((n, b) => n + (pledged.has(b.slug) ? 1 : 0), 0);

  return (
    <ScrollView
      style={{ backgroundColor: C.paper }}
      contentContainerStyle={{ paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={C.green} />}
    >
      {/* 1 · Hero */}
      <View style={s.hero}>
        <View style={s.heroIcon}>
          <HandsIcon size={34} color={C.gold} strokeWidth={2} />
        </View>
        <Text style={s.heroKicker}>THE CIVIC REVOLUTION · OGUAA</Text>
        <Text style={s.heroTitle}>
          Build a <Text style={{ color: C.gold }}>better</Text> Oguaa.
        </Text>
        <Text style={s.heroLede}>
          Great towns are not built by grand gestures. They are built by the small daily
          behaviours of ordinary people — the litter picked up, the queue kept, the elder
          greeted, the work done well. This is the quiet revolution, and it is ours to start.
        </Text>
        {behaviors.length > 0 ? (
          <View style={s.heroStats}>
            <Text style={s.heroStat}><Text style={s.heroStatNum}>{behaviors.length}</Text> behaviours</Text>
            <Text style={s.heroStat}><Text style={s.heroStatEm}>{doCount}</Text> to keep · <Text style={s.heroStatEm}>{stopCount}</Text> to drop</Text>
            <Text style={s.heroStat}><Text style={s.heroStatEm}>{rings.length}</Text> rings of life</Text>
            {pledgeCount > 0 ? <Text style={[s.heroStat, { color: C.gold }]}>You&apos;ve pledged {pledgeCount}</Text> : null}
          </View>
        ) : null}
      </View>

      {/* 1b · The town's goals */}
      <GoalsSection goals={goalsQuery.data ?? []} />

      {/* 2 · What made them great */}
      {civilizations.length > 0 ? (
        <View style={s.section}>
          <Kicker>WHAT MADE THEM GREAT</Kicker>
          <Text style={s.sectionTitle}>Civic habits outlast empires</Text>
          <Text style={s.sectionLede}>
            Every civilization that flourished did so on shared civic behaviour — not on wealth
            or arms alone. Here is what they kept, and what it teaches a town like ours.
          </Text>
          <View style={{ gap: 12, marginTop: 16 }}>
            {civilizations.map((c, i) => <CivilizationCard key={c.slug} c={c} index={i} />)}
          </View>
        </View>
      ) : null}

      {/* 3 · The behaviours, ring by ring */}
      <View style={s.section}>
        <Kicker>FROM THE SELF OUTWARD</Kicker>
        <Text style={s.sectionTitle}>The behaviours that build a town</Text>
        <Text style={s.sectionLede}>
          Six rings of civic life, each widening from the person you are to the nation we share.
          Keep the greens; drop the clays.
        </Text>

        {rings.length === 0 ? (
          <EmptyState
            icon={<HandsIcon size={52} color={C.inkFaint} strokeWidth={1.5} />}
            title="The civic charter is being written"
            body="Check back soon — the behaviours that build a better Oguaa are on their way."
          />
        ) : (
          <View style={{ gap: 28, marginTop: 18 }}>
            {rings.map((ring) => {
              const items = byRing.get(ring) ?? [];
              return (
                <View key={ring}>
                  <RingHeader ring={ring} />
                  <View style={{ gap: 18, marginTop: 14 }}>
                    <BehaviourGroup type="do" items={items.filter((b) => b.type === "do")} />
                    <BehaviourGroup type="stop" items={items.filter((b) => b.type === "stop")} />
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* 4 · Take the pledge */}
      <View style={s.section}>
        <Kicker>YOUR PART</Kicker>
        <Text style={s.sectionTitle}>Take the pledge</Text>
        <Text style={s.sectionLede}>
          Tick the behaviours you commit to. Nothing is sent anywhere — your pledge is kept
          privately on this device, a promise from you to your town.
        </Text>

        {/* Running count + warm confirmation. */}
        <RevealView style={s.pledgeMeter}>
          <View style={s.pledgeMeterHead}>
            <Text style={s.pledgeCount}>{pledgeCount}</Text>
            <Text style={s.pledgeCountLabel}>{pledgeCount === 1 ? "behaviour pledged" : "behaviours pledged"}</Text>
          </View>
          <Text accessibilityLiveRegion="polite" style={s.pledgeMsg}>
            {pledgeCount > 0
              ? `Medaase — you pledged ${pledgeCount} ${pledgeCount === 1 ? "behaviour" : "behaviours"} for a better Oguaa.`
              : "Tick the habits you'll live by to begin your pledge."}
          </Text>
          {pledgeCount > 0 ? (
            <Pressable accessibilityRole="button" onPress={clear} style={s.clearBtn}>
              <Text style={s.clearBtnText}>Clear pledge</Text>
            </Pressable>
          ) : null}
        </RevealView>

        {behaviors.length > 0 ? (
          <View style={{ gap: 20, marginTop: 20 }}>
            {rings.map((ring) => {
              const meta = RING_META[ring];
              const items = byRing.get(ring) ?? [];
              return (
                <View key={ring}>
                  <View style={s.pledgeGroupHead}>
                    <View style={s.pledgeGroupIcon}>
                      <RingIcon ring={ring} size={16} color={C.goldText} />
                    </View>
                    <Text style={s.pledgeGroupLabel}>
                      {meta.label}
                      {meta.fante ? <Text style={s.ringFanteSm}>  {meta.fante}</Text> : null}
                    </Text>
                  </View>
                  <View style={{ gap: 8, marginTop: 10 }}>
                    {items.map((b) => (
                      <PledgeItem key={b.slug} b={b} checked={pledged.has(b.slug)} onToggle={() => toggle(b.slug)} />
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}
      </View>

      {/* Closing line */}
      <View style={s.closing}>
        <Text style={s.closingTitle}>A town is the sum of its habits</Text>
        <Text style={s.closingBody}>
          Pride, then cohesion, then a place worth showing the world. Turn the pledge into
          practice — live the greens today.
        </Text>
      </View>
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  hero: {
    backgroundColor: C.green900,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 28,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  heroIcon: {
    width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center",
    backgroundColor: C.goldTint14, borderWidth: 1, borderColor: C.goldBorder35, marginBottom: 14,
  },
  heroKicker: { color: C.gold, fontSize: 11, letterSpacing: 2, ...D(700) },
  heroTitle: { color: ON_GREEN, ...D(600), fontSize: 38, lineHeight: 42, marginTop: 8 },
  heroLede: { color: C.onDarkText85, fontSize: 15, lineHeight: 22, marginTop: 12 },
  heroStats: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 20 },
  heroStat: { color: C.onDarkText60, fontSize: 13, ...S(500) },
  heroStatNum: { color: C.gold, ...S(700), fontSize: 16 },
  heroStatEm: { color: ON_GREEN, ...S(700) },

  section: { paddingHorizontal: 20, paddingTop: 28 },
  sectionKicker: { color: C.inkFaint, fontSize: 11, letterSpacing: 2, ...D(700) },
  sectionTitle: { ...D(700), fontSize: 24, color: C.ink, marginTop: 8 },
  sectionLede: { color: C.inkMuted, fontSize: 14, lineHeight: 21, marginTop: 8 },

  // Civilizations
  civCard: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 16, padding: 18 },
  civEra: { color: C.goldText, fontSize: 11, letterSpacing: 2, ...S(700), textTransform: "uppercase" },
  civName: { ...D(600), fontSize: 22, color: C.ink, marginTop: 6 },
  civPrinciple: { color: C.greenText, fontSize: 14, ...S(700), marginTop: 8 },
  civLesson: { color: C.inkMuted, fontSize: 14, lineHeight: 21, marginTop: 6 },

  // Ring headers
  ringHead: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  ringIconWrap: {
    width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center",
    backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand,
  },
  ringLabel: { ...D(700), fontSize: 22, color: C.ink },
  ringFante: { ...SI(), fontSize: 16, color: C.goldText },
  ringFanteSm: { ...SI(), fontSize: 13, color: C.goldText },
  ringAccent: { height: 3, width: 44, borderRadius: 999, marginTop: 8 },
  ringBlurb: { color: C.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 8 },

  // Do/stop groups
  groupHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  groupLabel: { fontSize: 13, letterSpacing: 1.2, ...S(700), textTransform: "uppercase" },
  behaviourCard: { backgroundColor: C.cream, borderWidth: 1, borderRadius: 16, padding: 16 },
  behaviourHead: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  behaviourTitle: { flex: 1, ...S(700), fontSize: 16, lineHeight: 21, color: C.ink },
  behaviourDesc: { color: C.inkMuted, fontSize: 14, lineHeight: 21, marginTop: 10 },
  whyToggle: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 },
  whyToggleText: { fontSize: 12, letterSpacing: 1, ...S(700), textTransform: "uppercase" },
  whyBody: { marginTop: 10, borderLeftWidth: 2, paddingLeft: 12 },
  whyText: { color: C.inkMuted, fontSize: 14, lineHeight: 21 },

  // Pledge
  pledgeMeter: {
    marginTop: 18, borderRadius: 20, borderWidth: 1, borderColor: withAlpha(C.green, 0.25),
    backgroundColor: withAlpha(C.green, 0.05), padding: 20, gap: 12,
  },
  pledgeMeterHead: { flexDirection: "row", alignItems: "baseline", gap: 12 },
  pledgeCount: { ...D(700), fontSize: 46, color: C.greenText },
  pledgeCountLabel: { color: C.inkMuted, fontSize: 13, letterSpacing: 1, ...S(700), textTransform: "uppercase", flexShrink: 1 },
  pledgeMsg: { color: C.inkMuted, fontSize: 14, lineHeight: 21 },
  clearBtn: { alignSelf: "flex-start", borderWidth: 1, borderColor: withAlpha(C.ink, 0.2), borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  clearBtnText: { color: C.inkMuted, fontSize: 13, ...S(700) },

  pledgeGroupHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  pledgeGroupIcon: {
    width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center",
    backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand,
  },
  pledgeGroupLabel: { ...S(700), fontSize: 17, color: C.ink },
  pledgeRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    borderWidth: 1, borderColor: C.sand, backgroundColor: C.cream, borderRadius: 14, padding: 14,
  },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center", marginTop: 1 },
  pledgeChip: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  pledgeChipText: { fontSize: 10, letterSpacing: 0.8, ...S(700) },
  pledgeTitle: { ...S(700), fontSize: 15, lineHeight: 20, color: C.ink, marginTop: 6 },

  // Closing
  closing: { marginHorizontal: 20, marginTop: 32, backgroundColor: C.green, borderRadius: 20, padding: 24, alignItems: "center" },
  closingTitle: { ...D(700), fontSize: 22, color: ON_GREEN, textAlign: "center" },
  closingBody: { color: C.onDarkText85, fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 10 },
});
