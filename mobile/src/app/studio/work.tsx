import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { presentCheckout, sessionFromStartResponse } from "@/lib/payments";
import { route, ROUTES } from "@/lib/routes";
import { push } from "@/lib/router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { T as Text } from "@/components/typography";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth";
import type { Listing, MemberView, Promotion } from "@/lib/types";
import { D, S, initials, withAlpha, ON_GREEN, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { Loading, ErrorView, HeroBand, Thumb } from "@/ui";
import { EmptyState } from "@/components/empty-state";
import { fmtDate } from "@/components/studio-kit";
import { CheckIcon, PenIcon, PlusIcon, StarIcon } from "@/components/icons";

/*
 * My Work — ports creator/src/pages/MyWork.tsx. The member's own listings (all
 * statuses), with status-filter tabs, a promote action on approved listings
 * (the mobile checkout mirrors me.tsx's PromoteControl), and an edit link to the
 * dedicated edit route. Listings come from api.member(slug) — a member's own
 * view carries every listing they own, at every status.
 */

const TYPE_LABELS: Record<string, string> = {
  business: "Business", artist: "Artist", person: "Person", memory: "Memory",
  property: "Property",
  event: "Event", opportunity: "Opportunity", memorial: "Memorial", project: "Project",
  incident: "Incident", lostfound: "Lost & found",
};

// The owner editor covers the member-submittable types; incident/lostfound have
// their own flows and projects belong to institutions.
const EDITABLE = new Set(["artist", "business", "property", "event", "memory", "opportunity", "person", "memorial"]);

// In-app public detail routes for an approved listing (null = no detail page).
const LISTING_HREF: Record<string, string> = {
  artist: "/music/", business: "/business/", memorial: "/memoriam/",
  property: "/rent-stay/",
  project: "/projects/", event: "/events/", person: "/people/",
};

const FILTERS = ["all", "draft", "pending", "approved", "rejected"] as const;
type Filter = (typeof FILTERS)[number];

// createdAt / submittedAt / rejectionReason live on the server listing but not
// the mobile public Listing type — read them off a narrowed view.
type ListingMeta = { createdAt?: string; submittedAt?: string; rejectionReason?: string };
const meta = (l: Listing) => l as Listing & ListingMeta;

export default function StudioWork() {
  const { member, loading: authLoading } = useAuth();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { data, loading, error, reload } = useApi<MemberView>(
    async () => {
      if (!member) throw new Error("Not signed in");
      return api.member(member.slug);
    },
    `studio:work:${member?.id ?? "anon"}`,
  );

  // Refresh when returning from the edit route (the screen stays mounted under
  // the pushed editor, so useApi won't refetch on its own). Skip the first
  // focus — the mount fetch already covers it. reload is read via a ref so the
  // focus effect stays stable and never loops.
  const reloadRef = useRef(reload);
  useEffect(() => { reloadRef.current = reload; }, [reload]);
  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) { firstFocus.current = false; return; }
    reloadRef.current();
  }, []));

  const [filter, setFilter] = useState<Filter>("all");

  if (authLoading || (loading && member)) return <Loading />;
  if (!member) {
    return (
      <View style={s.gate}>
        <Text style={s.gateTitle}>My work</Text>
        <Text style={s.gateBody}>Sign in to see your listings and their review status.</Text>
        <Pressable accessibilityRole="button" onPress={() => router.replace(ROUTES.signIn)} style={s.primaryBtn}>
          <Text style={s.primaryBtnText}>Sign in / create account</Text>
        </Pressable>
      </View>
    );
  }
  if (error || !data) return <ErrorView message={error ?? "Couldn't load your listings"} />;

  const listings = data.listings;
  const filtered = filter === "all" ? listings : listings.filter((l) => l.status === filter);
  const counts: Record<Filter, number> = {
    all: listings.length,
    draft: listings.filter((l) => l.status === "draft").length,
    pending: listings.filter((l) => l.status === "pending").length,
    approved: listings.filter((l) => l.status === "approved").length,
    rejected: listings.filter((l) => l.status === "rejected").length,
  };

  return (
    <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 48 }}>
      <HeroBand
        tone={C.green}
        kicker="My work"
        title="Your listings"
        lede="Everything you've contributed, with its review status. Promote an approved listing to feature it across the app — GH₵ 10 per day."
      />

      <View style={s.body}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          {FILTERS.map((f) => (
            <Pressable accessibilityRole="button" key={f} onPress={() => setFilter(f)} style={[s.chip, filter === f && s.chipOn]}>
              <Text style={[s.chipText, filter === f && s.chipTextOn]}>
                {f} <Text style={[s.chipCount, filter === f && s.chipTextOn]}>({counts[f]})</Text>
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {filtered.length === 0 ? (
          <View style={s.emptyCard}>
            <EmptyState
              icon={<PenIcon size={56} color={C.inkFaint} strokeWidth={1.5} />}
              title={filter === "all" ? "Nothing yet" : `No ${filter} listings`}
              body={filter === "all"
                ? "Your businesses, events, art and projects show up here once you submit them."
                : `You have no listings with "${filter}" status.`}
              actionLabel={filter === "all" ? "Add your first listing" : undefined}
              onAction={filter === "all" ? () => push(ROUTES.submit) : undefined}
            />
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {filtered.map((l) => <WorkRow key={l.id} listing={l} onChanged={reload} />)}
          </View>
        )}

        <Pressable accessibilityRole="button" onPress={() => push(ROUTES.submit)} style={s.addListingBtn}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <PlusIcon size={16} color={C.goldText} strokeWidth={2.5} />
            <Text style={s.addListingText}>Add a listing</Text>
          </View>
        </Pressable>

        <Text style={s.footNote}>
          Tap Edit to change a listing — approved listings stay live, others go back into review.
        </Text>
      </View>
    </ScrollView>
  );
}

function WorkRow({ listing: l, onChanged }: Readonly<{ listing: Listing; onChanged: () => void }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const added = meta(l).submittedAt ?? meta(l).createdAt;
  const reason = l.status === "rejected" ? meta(l).rejectionReason : undefined;
  const featuredUntil = l.featuredUntil && l.featuredUntil > new Date().toISOString() ? l.featuredUntil : null;
  const base = l.status === "approved" ? LISTING_HREF[l.type] : undefined;
  const viewHref = base ? `${base}${l.slug}` : null;

  return (
    <View style={s.row}>
      <View style={s.rowTop}>
        {l.coverImageUrl ? (
          <Thumb seed={l.slug} src={l.coverImageUrl} label={initials(l.title)} style={s.thumb} labelStyle={s.thumbText} />
        ) : (
          <View style={s.thumb}><Text style={s.thumbText}>{initials(l.title)}</Text></View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.title} numberOfLines={1}>{l.title}</Text>
          <Text style={s.metaLine} numberOfLines={2}>
            {TYPE_LABELS[l.type] ?? l.type}{added ? ` · added ${fmtDate(added)}` : ""}{reason ? ` — ${reason}` : ""}
          </Text>
        </View>
        <StatusChip status={l.status} />
      </View>

      {featuredUntil && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <StarIcon size={12} color={C.goldText} strokeWidth={2.5} />
          <Text style={s.featuredNote}>Featured until {fmtDate(featuredUntil)}</Text>
        </View>
      )}

      <View style={s.actions}>
        <View style={s.actionsLeft}>
          {EDITABLE.has(l.type) && (
            <Pressable accessibilityRole="button" onPress={() => push(route.listingEdit(l.id))} style={s.ghostBtn}>
              <Text style={s.ghostBtnText}>Edit</Text>
            </Pressable>
          )}
          {viewHref && (
            <Pressable accessibilityRole="button" onPress={() => push(viewHref)} style={s.ghostBtn}>
              <Text style={s.ghostBtnText}>View</Text>
            </Pressable>
          )}
        </View>
        {l.status === "approved" && <PromoteControl listing={l} onDone={onChanged} />}
      </View>
    </View>
  );
}

function StatusChip({ status }: Readonly<{ status: string }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const chip: Record<string, { bg: object; color: string }> = {
    approved: { bg: s.statusOk, color: C.greenText },
    pending: { bg: s.statusPending, color: C.goldText },
    rejected: { bg: s.statusBad, color: C.maroonText },
  };
  const v = chip[status] ?? { bg: s.statusMuted, color: C.inkMuted };
  return (
    <View style={[s.statusChip, v.bg]}>
      <Text style={[s.statusText, { color: v.color }]}>{status}</Text>
    </View>
  );
}

// Promote an approved listing — mirrors me.tsx's PromoteControl: settle in place
// when Paystack is simulated (dev), otherwise open checkout and verify after.
function PromoteControl({ listing, onDone }: Readonly<{ listing: Listing; onDone: () => void }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [pendingRef, setPendingRef] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Promotion | null>(null);

  async function promote(days: number) {
    setBusy(true); setErr("");
    try {
      const r = await api.promoteListing(listing.id, days);
      const amountPesewas = days * 10 * 100;
      const result = await presentCheckout(
        sessionFromStartResponse(r, { amountPesewas, flow: "promotion", metadata: { listingId: listing.id, days: String(days) } })
      );
      if (result.kind === "error") {
        setErr(result.message);
      } else if (result.kind === "cancelled") {
        // keep the picker open
      } else if (result.provider === "simulated") {
        const p = await api.confirmPromotion(r.reference);
        setConfirmed(p);
        setOpen(false);
        onDone();
      } else if (result.provider === "stripe") {
        const p = await api.confirmPromotion(r.reference);
        setConfirmed(p);
        setOpen(false);
        onDone();
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
      const p = await api.confirmPromotion(pendingRef);
      setConfirmed(p);
      setPendingRef(null);
      setOpen(false);
      onDone();
    } catch {
      setErr("Payment not confirmed yet. Finish paying in the browser, then verify again.");
    } finally { setBusy(false); }
  }

  if (confirmed) return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <StarIcon size={12} color={C.goldText} strokeWidth={2.5} />
      <Text style={s.promoDone}>Featured {confirmed.days}d</Text>
      <CheckIcon size={12} color={C.goldText} strokeWidth={2.5} />
    </View>
  );
  if (pendingRef) {
    return (
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <Pressable accessibilityRole="button" onPress={verify} disabled={busy} style={[s.promoBtn, busy && { opacity: 0.6 }]}>
          <Text style={s.promoBtnText}>{busy ? "Checking…" : "I've paid — verify"}</Text>
        </Pressable>
        {err !== "" && <Text style={s.promoErr}>{err}</Text>}
      </View>
    );
  }
  if (open) {
    return (
      <View style={{ alignItems: "flex-end", gap: 6 }}>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {[7, 14, 30].map((d) => (
            <Pressable accessibilityRole="button" key={d} onPress={() => promote(d)} disabled={busy} style={[s.promoDayBtn, busy && { opacity: 0.6 }]}>
              <Text style={s.promoDayText}>{d}d</Text>
              <Text style={s.promoDayPrice}>GH₵{d * 10}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable accessibilityRole="button" onPress={() => { setOpen(false); setErr(""); }} hitSlop={6} style={{ minHeight: 32, justifyContent: "center" }}>
          <Text style={s.promoCancel}>Cancel</Text>
        </Pressable>
        {err !== "" && <Text style={s.promoErr}>{err}</Text>}
      </View>
    );
  }
  return (
    <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={s.promoBtn}>
      <Text style={s.promoBtnText}>Promote</Text>
    </Pressable>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  gate: { flex: 1, backgroundColor: C.paper, padding: 28, justifyContent: "center", alignItems: "center" },
  gateTitle: { ...D(600), fontSize: 26, color: C.ink, textAlign: "center" },
  gateBody: { color: C.inkMuted, fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 10, maxWidth: 320 },
  primaryBtn: { backgroundColor: C.green, borderRadius: 999, paddingVertical: 13, paddingHorizontal: 24, marginTop: 18 },
  primaryBtnText: { color: ON_GREEN, ...S(700), fontSize: 15 },

  body: { padding: 16 },
  chips: { flexDirection: "row", gap: 8, paddingBottom: 14 },
  chip: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.cream, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  chipOn: { borderColor: C.green, backgroundColor: C.green },
  chipText: { color: C.inkMuted, fontSize: 13, ...S(600), textTransform: "capitalize" },
  chipTextOn: { color: ON_GREEN },
  chipCount: { opacity: 0.7 },

  emptyCard: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 16 },

  row: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 14, padding: 12, gap: 10 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  thumb: { width: 44, height: 44, borderRadius: 10, backgroundColor: withAlpha(C.green, 0.08), alignItems: "center", justifyContent: "center" },
  thumbText: { color: C.greenText, ...S(700), fontSize: 13 },
  title: { color: C.ink, fontSize: 15, ...D(700) },
  metaLine: { color: C.inkFaint, fontSize: 12, marginTop: 2, lineHeight: 17 },
  featuredNote: { color: C.goldText, fontSize: 12, ...S(700) },

  actions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, minHeight: 36 },
  actionsLeft: { flexDirection: "row", gap: 8 },
  ghostBtn: { borderWidth: 1, borderColor: C.sand, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  ghostBtnText: { color: C.inkMuted, fontSize: 12, ...S(700) },

  statusChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusOk: { backgroundColor: withAlpha(C.green, 0.08) },
  statusPending: { backgroundColor: withAlpha(C.gold, 0.16) },
  statusBad: { backgroundColor: withAlpha(C.maroon, 0.08) },
  statusMuted: { backgroundColor: C.sand },
  statusText: { fontSize: 11, ...S(700), textTransform: "capitalize" },

  promoBtn: { borderWidth: 1, borderColor: C.goldBrand, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, minHeight: 36, justifyContent: "center" },
  promoBtnText: { color: C.goldText, fontSize: 12, ...S(700) },
  promoDayBtn: { borderWidth: 1, borderColor: C.green, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, alignItems: "center", minWidth: 52, minHeight: 44, justifyContent: "center" },
  promoDayText: { color: C.greenText, fontSize: 13, ...S(700) },
  promoDayPrice: { color: C.inkFaint, fontSize: 10, marginTop: 1 },
  promoCancel: { color: C.inkFaint, fontSize: 12, ...S(600) },
  promoErr: { color: C.clayText, fontSize: 11, maxWidth: 220, textAlign: "right" },
  promoDone: { color: C.goldText, fontSize: 12, ...S(700) },

  addListingBtn: { borderWidth: 1, borderStyle: "dashed", borderColor: C.goldBrand, borderRadius: 999, paddingVertical: 12, alignItems: "center", marginTop: 16 },
  addListingText: { color: C.goldText, fontSize: 14, ...S(700) },
  footNote: { color: C.inkFaint, fontSize: 12, lineHeight: 18, marginTop: 14 },
});
