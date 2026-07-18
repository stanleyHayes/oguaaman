import { useMemo, useState } from "react";
import { route, ROUTES } from "@/lib/routes";
import { push } from "@/lib/router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router, type Href } from "expo-router";
import { T as Text } from "@/components/typography";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth";
import type { Notification } from "@/lib/types";
import { D, S, ON_GREEN, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { Loading, ErrorView } from "@/ui";
import { RevealView, StaggerIn } from "@/components/anim";
import { EmptyState } from "@/components/empty-state";
import { ArrowRightIcon, BellIcon, EnvelopeIcon } from "@/components/icons";

function when(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Palette token per notification kind — resolved against the active theme.
const KIND_TOKEN: Record<string, keyof Palette> = {
  approved: "teal", rejected: "maroon", changes: "goldBrand", remembrance: "goldBrand",
  birthday: "gold", report: "maroon", welcome: "green", directive: "clay",
};

function kindLabel(kind: string): string {
  return kind.replaceAll("_", " ").replaceAll("-", " ").trim() || "Update";
}

// Notification links are portal paths; translate them to mobile routes.
function mobileLink(link?: string): Href | null {
  if (!link) return null;
  // The directive broadcast links to the alerts screen.
  if (link === ROUTES.alerts || link.startsWith(ROUTES.alerts)) return ROUTES.alerts as Href;
  // Same-shaped routes pass straight through.
  if (["/memoriam/", "/members/", "/news/", "/music/", "/people/", "/business/", "/institutions/", "/projects/"].some((r) => link.startsWith(r))) return link as Href;
  // Portal paths with a different mobile home.
  if (link.startsWith("/education/")) return route.institution(link.slice("/education/".length));
  if (link === "/events" || link.startsWith("/events")) return ROUTES.browseEvents;
  if (link === "/community" || link.startsWith("/community")) return ROUTES.browseOpportunities;
  return null;
}

export default function Notifications() {
  const { member, loading } = useAuth();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  if (loading) return <Loading />;
  if (!member) {
    return (
      <View style={s.gate}>
        <Text style={s.gateTitle}>Notifications</Text>
        <Text style={s.gateBody}>Sign in to see updates on your listings and the people and memorials you follow.</Text>
        <Pressable accessibilityRole="button" onPress={() => router.replace(ROUTES.signIn)} style={s.primaryBtn}><Text style={s.primaryBtnText}>Sign in</Text></Pressable>
      </View>
    );
  }
  return <NotifLoaded />;
}

function NotifLoaded() {
  const { data, error, loading } = useApi<Notification[]>(() => api.notifications(), "notifications");
  if (loading) return <Loading />;
  if (error) return <ErrorView message={error} />;
  return <NotifList initial={data ?? []} />;
}

function NotifList({ initial }: Readonly<{ initial: Notification[] }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [items, setItems] = useState<Notification[]>(initial);
  const [busy, setBusy] = useState(false);
  const unread = items.filter((n) => !n.read).length;

  async function markAll() {
    if (busy || unread === 0) return;
    setBusy(true);
    setItems((cur) => cur.map((n) => ({ ...n, read: true })));
    try { await api.markAllNotificationsRead(); } catch { /* optimistic */ } finally { setBusy(false); }
  }

  async function openItem(n: Notification) {
    if (!n.read) {
      setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      try { await api.markNotificationRead(n.id); } catch { /* optimistic */ }
    }
    const dest = mobileLink(n.link);
    if (dest) push(dest);
  }

  return (
    <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}>
      <RevealView style={s.topRow}>
        <View>
          <Text style={s.pageTitle}>Notifications</Text>
          <Text style={s.count}>{unread > 0 ? `${unread} unread` : "All caught up"}</Text>
        </View>
        {unread > 0 && (
          <Pressable accessibilityRole="button" accessibilityLabel="Mark all notifications as read" onPress={markAll} disabled={busy} style={({ pressed }) => [s.markBtn, pressed && s.buttonPressed]}><Text style={s.markText}>Mark all read</Text></Pressable>
        )}
      </RevealView>

      {items.length === 0 && <EmptyState icon={<EnvelopeIcon size={56} color={C.inkFaint} strokeWidth={1.5} />} title="No notifications yet" body="Updates on your listings and remembrances will appear here." />}

      {items.map((n, i) => {
        const linkable = mobileLink(n.link) != null;
        const tone = C[KIND_TOKEN[n.kind] ?? "inkFaint"];
        const date = when(n.createdAt);
        return (
          <StaggerIn key={n.id} index={i}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${n.read ? "Read" : "Unread"} ${kindLabel(n.kind)} notification. ${n.title}. ${n.body}${date ? `. ${date}` : ""}`}
              accessibilityHint={linkable ? "Marks as read and opens the related item" : n.read ? undefined : "Marks notification as read"}
              onPress={() => openItem(n)}
              style={({ pressed }) => [s.card, !n.read && s.cardUnread, pressed && s.cardPressed]}
            >
              <View style={[s.bar, { backgroundColor: tone, opacity: n.read ? 0.35 : 1 }]} />
              <View style={[s.iconTile, { borderColor: tone }]}>
                <BellIcon size={20} color={tone} strokeWidth={1.9} />
                {!n.read ? <View style={[s.unreadDot, { backgroundColor: tone }]} /> : null}
              </View>
              <View style={s.cardContent}>
                <View style={s.cardHead}>
                  <Text style={[s.cardKicker, { color: tone }]} numberOfLines={1}>{n.read ? kindLabel(n.kind) : `Unread · ${kindLabel(n.kind)}`}</Text>
                  {date ? <Text style={s.cardDate}>{date}</Text> : null}
                </View>
                <Text style={s.cardTitle} numberOfLines={2}>{n.title}</Text>
                <Text style={s.cardBody} numberOfLines={2}>{n.body}</Text>
              </View>
              {linkable ? <View style={s.cardArrow}><ArrowRightIcon size={15} color={C.greenText} strokeWidth={2.3} /></View> : null}
            </Pressable>
          </StaggerIn>
        );
      })}
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  gate: { flex: 1, backgroundColor: C.paper, padding: 28, justifyContent: "center", alignItems: "center" },
  gateTitle: { ...D(600), fontSize: 26, color: C.ink, textAlign: "center" },
  gateBody: { color: C.inkMuted, fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 10, maxWidth: 320 },
  primaryBtn: { backgroundColor: C.green, borderRadius: 999, paddingVertical: 13, paddingHorizontal: 24, marginTop: 18 },
  primaryBtnText: { color: ON_GREEN, ...S(700), fontSize: 15 },

  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  pageTitle: { ...D(700), fontSize: 26, color: C.ink },
  count: { color: C.goldText, fontSize: 11, letterSpacing: 1.5, ...S(700), textTransform: "uppercase", marginTop: 2 },
  markBtn: { borderWidth: 1, borderColor: C.green, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  markText: { color: C.greenText, ...S(700), fontSize: 12 },

  card: { position: "relative", flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 17, paddingVertical: 11, paddingLeft: 14, paddingRight: 11, overflow: "hidden", minHeight: 102, shadowColor: "#000", shadowOpacity: 0.035, shadowRadius: 7, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  // Unread lift: was the off-palette #fffdf7 (≈1.5% brighter than paper), which
  // would glare under light ink in dark mode — paper is the nearest token; the
  // goldBrand border stays the primary unread cue.
  cardUnread: { backgroundColor: C.paper, borderColor: C.goldBrand },
  cardPressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
  bar: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  iconTile: { position: "relative", width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: C.paper, borderWidth: 1 },
  unreadDot: { position: "absolute", right: 7, top: 7, width: 7, height: 7, borderRadius: 4, borderWidth: 1, borderColor: C.paper },
  cardContent: { flex: 1, minWidth: 0 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  cardKicker: { flex: 1, fontSize: 9, letterSpacing: 1, textTransform: "uppercase", ...S(700) },
  cardTitle: { ...S(700), fontSize: 16, lineHeight: 20, color: C.ink, marginTop: 2 },
  cardDate: { color: C.inkFaint, fontSize: 10, ...S(600) },
  cardBody: { color: C.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  cardArrow: { width: 29, height: 29, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: C.goldTint14, borderWidth: 1, borderColor: C.goldBorder35 },
  buttonPressed: { opacity: 0.68 },
});
