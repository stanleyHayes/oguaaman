import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
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

// Notification links are portal paths; translate them to mobile routes.
function mobileLink(link?: string): string | null {
  if (!link) return null;
  // The directive broadcast links to the alerts screen.
  if (link === "/alerts" || link.startsWith("/alerts")) return "/alerts";
  // Same-shaped routes pass straight through.
  if (["/memoriam/", "/members/", "/news/", "/music/", "/people/", "/business/", "/institutions/", "/projects/"].some((r) => link.startsWith(r))) return link;
  // Portal paths with a different mobile home.
  if (link.startsWith("/education/")) return `/institutions/${link.slice("/education/".length)}`;
  if (link === "/events" || link.startsWith("/events")) return "/browse/events";
  if (link === "/community" || link.startsWith("/community")) return "/browse/opportunities";
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
        <Pressable onPress={() => router.replace("/signin")} style={s.primaryBtn}><Text style={s.primaryBtnText}>Sign in</Text></Pressable>
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
    if (dest) router.push(dest as never);
  }

  return (
    <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}>
      <RevealView style={s.topRow}>
        <View>
          <Text style={s.pageTitle}>Notifications</Text>
          <Text style={s.count}>{unread > 0 ? `${unread} unread` : "All caught up"}</Text>
        </View>
        {unread > 0 && (
          <Pressable onPress={markAll} disabled={busy} style={s.markBtn}><Text style={s.markText}>Mark all read</Text></Pressable>
        )}
      </RevealView>

      {items.length === 0 && <EmptyState glyph="✉" title="No notifications yet" body="Updates on your listings and remembrances will appear here." />}

      {items.map((n, i) => {
        const linkable = mobileLink(n.link) != null;
        return (
          <StaggerIn key={n.id} index={i}>
            <Pressable onPress={() => openItem(n)} style={[s.card, !n.read && s.cardUnread]}>
              <View style={[s.bar, { backgroundColor: C[KIND_TOKEN[n.kind] ?? "inkFaint"], opacity: n.read ? 0.3 : 1 }]} />
              <View style={{ flex: 1 }}>
                <View style={s.cardHead}>
                  <Text style={s.cardTitle}>{n.title}</Text>
                  <Text style={s.cardDate}>{when(n.createdAt)}</Text>
                </View>
                <Text style={s.cardBody}>{n.body}</Text>
                {linkable && <Text style={s.cardOpen}>Open →</Text>}
              </View>
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
  primaryBtnText: { color: ON_GREEN, fontWeight: "700", fontSize: 15 },

  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  pageTitle: { ...D(700), fontSize: 26, color: C.ink },
  count: { color: C.goldText, fontSize: 11, letterSpacing: 1.5, fontWeight: "700", textTransform: "uppercase", marginTop: 2 },
  markBtn: { borderWidth: 1, borderColor: C.green, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  markText: { color: C.greenText, fontWeight: "700", fontSize: 12 },

  card: { flexDirection: "row", gap: 12, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 12, padding: 14, overflow: "hidden" },
  // Unread lift: was the off-palette #fffdf7 (≈1.5% brighter than paper), which
  // would glare under light ink in dark mode — paper is the nearest token; the
  // goldBrand border stays the primary unread cue.
  cardUnread: { backgroundColor: C.paper, borderColor: C.goldBrand },
  bar: { width: 4, borderRadius: 2 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  cardTitle: { ...S(700), fontSize: 16, color: C.ink, flexShrink: 1 },
  cardDate: { color: C.inkFaint, fontSize: 11 },
  cardBody: { color: C.inkMuted, fontSize: 14, lineHeight: 20, marginTop: 3 },
  cardOpen: { color: C.tealText, fontSize: 12, fontWeight: "700", marginTop: 6 },
});
