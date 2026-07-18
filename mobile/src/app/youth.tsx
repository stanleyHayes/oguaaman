import { useMemo, useState } from "react";
import { route, ROUTES } from "@/lib/routes";
import { push } from "@/lib/router";
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { T as Text } from "@/components/typography";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useTheme } from "@/lib/theme-context";
import type { Listing } from "@/lib/types";
import { S, type Palette, D, withAlpha } from "@/theme";
import { Loading, ErrorView, PhotoHero, Thumb } from "@/ui";
import { EmptyState } from "@/components/empty-state";
import { ArrowRightIcon, SparkleIcon } from "@/components/icons";

// The opportunity kinds we filter the board by (spec §8.8), derived from tags.
const KINDS = ["scholarship", "internship", "apprenticeship", "training", "job", "investment", "mentorship"] as const;
type Kind = (typeof KINDS)[number];
type KindFilter = Kind | "all";

const KIND_LABEL: Record<Kind, string> = {
  scholarship: "Scholarships",
  internship: "Internships",
  apprenticeship: "Apprenticeships",
  training: "Training",
  job: "Jobs",
  investment: "Investment",
  mentorship: "Mentorship",
};

const YOUNG_TALENT_TAG = "young-talent";

interface YouthData {
  opps: Listing[];
  talents: Listing[];
}

function fmtDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export default function Youth() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [filter, setFilter] = useState<KindFilter>("all");
  const { data, error, loading, refreshing, reload } = useApi<YouthData>(
    () =>
      Promise.all([api.opportunities(), api.people()]).then(([opps, people]) => ({
        opps,
        talents: people.filter((p) => p.tags.includes(YOUNG_TALENT_TAG)),
      })),
    "youth",
  );
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "No data"} />;

  const shown = filter === "all" ? data.opps : data.opps.filter((o) => o.tags.includes(filter));

  return (
    <ScrollView
      style={{ backgroundColor: C.paper }}
      contentContainerStyle={{ paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={C.green} />}
    >
      <PhotoHero
        image="/uploads/seed/outdoor-classroom-ghana.jpg"
        tone={C.teal}
        kicker="Training the youth"
        title="Youth & opportunity"
        lede="Scholarships, internships, apprenticeships, training, jobs, investment windows and mentorship programmes for the young of Cape Coast — plus a spotlight on rising talent. Information and outbound links only: no private adult-to-minor contact ever runs through Oguaa."
      />
      <View style={{ padding: 16 }}>
      <Pressable accessibilityRole="button" onPress={() => push(ROUTES.submit)} style={s.cta}>
        <Text style={s.ctaText}>Post an opportunity</Text>
      </Pressable>

      {data.talents.length > 0 ? (
        <View style={{ marginTop: 24 }}>
          <Text style={s.kicker}>YOUNG-TALENT SPOTLIGHT</Text>
          <Text style={s.sectionBlurb}>
            Bright young Oguaa minds and talents, celebrated publicly. Profiles carry no contact details, by design.
          </Text>
          <View style={{ gap: 12, marginTop: 12 }}>
            {data.talents.map((p) => <TalentCard key={p.id} person={p} />)}
          </View>
        </View>
      ) : null}

      <Text style={[s.kicker, { marginTop: 28 }]}>OPPORTUNITIES BOARD</Text>
      <View style={s.tabs}>
        <Chip label={`All (${data.opps.length})`} active={filter === "all"} onSelect={() => setFilter("all")} />
        {KINDS.map((k) => (
          <Chip
            key={k}
            label={`${KIND_LABEL[k]} (${data.opps.filter((o) => o.tags.includes(k)).length})`}
            active={filter === k}
            onSelect={() => setFilter(k)}
          />
        ))}
      </View>

      {shown.length === 0 ? (
        <EmptyState icon={<SparkleIcon size={56} color={C.inkFaint} strokeWidth={1.5} />} title="Nothing open right now" body="Nothing in this category at the moment — check back soon." />
      ) : (
        <View style={{ gap: 12, marginTop: 16 }}>
          {shown.map((o) => <OppCard key={o.id} opp={o} />)}
        </View>
      )}
      </View>
    </ScrollView>
  );
}

function TalentCard({ person: p }: Readonly<{ person: Listing }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const d = p.details;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${p.title}'s profile`}
      onPress={() => push(route.person(p.slug))}
      style={({ pressed }) => [s.talentCard, pressed && s.cardPressed]}
    >
      <Thumb seed={p.slug} label={initials(p.title)} src={p.coverImageUrl} style={s.talentThumb} labelStyle={s.talentThumbLabel} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.talentKicker}>RISING TALENT</Text>
        <Text style={s.talentName} numberOfLines={1}>{p.title}</Text>
        {d.era ? <Text style={s.talentEra}>{d.era}</Text> : null}
        {d.whyNotable ? <Text style={s.talentBio} numberOfLines={2}>{d.whyNotable}</Text> : null}
      </View>
      <View style={s.cardArrow}><ArrowRightIcon size={15} color={C.tealText} strokeWidth={2.4} /></View>
    </Pressable>
  );
}

function Chip({ label, active, onSelect }: Readonly<{ label: string; active: boolean; onSelect: () => void }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onSelect} style={[s.chip, active && s.chipOn]}>
      <Text style={[s.chipText, active && s.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

function OppCard({ opp: o }: Readonly<{ opp: Listing }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const d = o.details;
  const kind = d.kind ?? "";
  return (
    <View style={s.card}>
      <View style={s.cardAccent} />
      <View style={s.chipRow}>
        <View style={s.kindChip}>
          <Text style={s.kindChipText}>{KIND_LABEL[kind as Kind] ?? (kind || "Opportunity")}</Text>
        </View>
        {d.deadline ? <Text style={s.deadline}>Apply by {fmtDate(d.deadline)}</Text> : null}
      </View>
      <Text style={s.title}>{o.title}</Text>
      {d.description ? <Text style={s.desc} numberOfLines={3}>{d.description}</Text> : null}
      {d.eligibility ? (
        <View style={s.eligibilityBox}>
          <Text style={s.eligibilityLabel}>ELIGIBILITY</Text>
          <Text style={s.eligibility} numberOfLines={2}>{d.eligibility}</Text>
        </View>
      ) : null}
      {d.guardianConsentRequired === true ? <Text style={s.guardian}>Guardian consent required for under-18 participants.</Text> : null}
      <View style={s.foot}>
        <View style={s.providerBlock}>
          <Text style={s.providerKicker}>OFFERED BY</Text>
          <Text style={s.provider} numberOfLines={1}>{d.provider || "Oguaa community"}</Text>
        </View>
        {d.applyUrl ? (
          <Pressable accessibilityRole="link" accessibilityLabel={`How to apply for ${o.title}`} onPress={() => void Linking.openURL(d.applyUrl ?? "")} style={s.applyBtn}>
            <Text style={s.applyBtnText}>How to apply</Text>
            <ArrowRightIcon size={13} color={C.tealText} strokeWidth={2.4} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  cta: { backgroundColor: C.teal, borderRadius: 999, paddingVertical: 13, alignItems: "center" },
  ctaText: { color: C.cream, ...S(700), fontSize: 15 },
  kicker: { color: C.inkFaint, fontSize: 11, letterSpacing: 2, ...D(700) },
  sectionBlurb: { color: C.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  chip: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.cream, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12, minHeight: 40, justifyContent: "center" },
  chipOn: { borderColor: C.teal, backgroundColor: C.teal },
  chipText: { color: C.inkMuted, fontSize: 12, ...S(700) },
  chipTextOn: { color: C.cream },
  cardPressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
  talentCard: { flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 15, padding: 11 },
  talentThumb: { width: 64, height: 72, borderRadius: 12 },
  talentThumbLabel: { color: C.cream, ...S(700), fontSize: 18 },
  talentKicker: { color: C.tealText, fontSize: 8.5, ...S(700), letterSpacing: 1.2 },
  talentName: { ...S(700), fontSize: 16, lineHeight: 20, color: C.ink, marginTop: 2 },
  talentEra: { color: C.goldText, fontSize: 10, ...S(700), letterSpacing: 0.8, textTransform: "uppercase", marginTop: 1 },
  talentBio: { color: C.inkMuted, fontSize: 11.5, lineHeight: 16, marginTop: 4 },
  cardArrow: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: withAlpha(C.teal, 0.09) },
  card: { position: "relative", overflow: "hidden", backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 15, paddingVertical: 13, paddingLeft: 17, paddingRight: 13 },
  cardAccent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3, backgroundColor: C.teal },
  chipRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  kindChip: { borderWidth: 1, borderColor: C.teal, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  kindChipText: { color: C.tealText, fontSize: 11, ...S(700) },
  deadline: { marginLeft: "auto", color: C.clayText, fontSize: 11, ...S(700) },
  title: { ...S(700), fontSize: 17, lineHeight: 21, color: C.ink, marginTop: 8 },
  desc: { color: C.inkMuted, fontSize: 12.5, lineHeight: 18, marginTop: 4 },
  eligibilityBox: { marginTop: 9, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: C.paper, borderWidth: StyleSheet.hairlineWidth, borderColor: C.sand },
  eligibility: { color: C.inkMuted, fontSize: 11.5, lineHeight: 16, marginTop: 2 },
  eligibilityLabel: { color: C.inkFaint, fontSize: 8, letterSpacing: 1.1, ...S(700) },
  guardian: { color: C.maroonText, backgroundColor: withAlpha(C.maroonText, 0.08), borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6, fontSize: 10.5, marginTop: 6, ...S(600) },
  foot: { flexDirection: "row", alignItems: "flex-end", gap: 10, marginTop: 10, paddingTop: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.sand },
  providerBlock: { flex: 1, minWidth: 0 },
  providerKicker: { color: C.inkFaint, fontSize: 8, letterSpacing: 1.1, ...S(700) },
  provider: { color: C.inkMuted, fontSize: 11, marginTop: 2 },
  applyBtn: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: C.teal, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, minHeight: 44, justifyContent: "center" },
  applyBtnText: { color: C.tealText, fontSize: 12, ...S(700) },
});
