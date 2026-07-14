import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth";
import type { Notification } from "@/lib/types";
import { C, serif } from "@/theme";
import { Loading, ErrorView } from "@/ui";

function when(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const KIND_COLOR: Record<string, string> = {
  approved: C.teal, rejected: C.maroon, changes: C.goldBrand, remembrance: C.goldBrand,
  birthday: C.gold, report: C.maroon, welcome: C.green,
};

// Notification links are portal paths; translate them to mobile routes.
function mobileLink(link?: string): string | null {
  if (!link) return null;
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
      <View style={s.topRow}>
        <View>
          <Text style={s.pageTitle}>Notifications</Text>
          <Text style={s.count}>{unread > 0 ? `${unread} unread` : "All caught up"}</Text>
        </View>
        {unread > 0 && (
          <Pressable onPress={markAll} disabled={busy} style={s.markBtn}><Text style={s.markText}>Mark all read</Text></Pressable>
        )}
      </View>

      {items.length === 0 && <Text style={s.empty}>No notifications yet. Updates on your listings and remembrances will appear here.</Text>}

      {items.map((n) => {
        const linkable = mobileLink(n.link) != null;
        return (
          <Pressable key={n.id} onPress={() => openItem(n)} style={[s.card, !n.read && s.cardUnread]}>
            <View style={[s.bar, { backgroundColor: KIND_COLOR[n.kind] ?? C.inkFaint, opacity: n.read ? 0.3 : 1 }]} />
            <View style={{ flex: 1 }}>
              <View style={s.cardHead}>
                <Text style={s.cardTitle}>{n.title}</Text>
                <Text style={s.cardDate}>{when(n.createdAt)}</Text>
              </View>
              <Text style={s.cardBody}>{n.body}</Text>
              {linkable && <Text style={s.cardOpen}>Open →</Text>}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  gate: { flex: 1, backgroundColor: C.paper, padding: 28, justifyContent: "center", alignItems: "center" },
  gateTitle: { fontFamily: serif, fontSize: 26, fontWeight: "600", color: C.ink, textAlign: "center" },
  gateBody: { color: C.inkMuted, fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 10, maxWidth: 320 },
  primaryBtn: { backgroundColor: C.green, borderRadius: 999, paddingVertical: 13, paddingHorizontal: 24, marginTop: 18 },
  primaryBtnText: { color: C.cream, fontWeight: "700", fontSize: 15 },

  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  pageTitle: { fontFamily: serif, fontSize: 26, fontWeight: "700", color: C.ink },
  count: { color: C.goldText, fontSize: 11, letterSpacing: 1.5, fontWeight: "700", textTransform: "uppercase", marginTop: 2 },
  markBtn: { borderWidth: 1, borderColor: C.green, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  markText: { color: C.green, fontWeight: "700", fontSize: 12 },
  empty: { color: C.inkFaint, fontStyle: "italic", textAlign: "center", marginTop: 24, lineHeight: 20 },

  card: { flexDirection: "row", gap: 12, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 12, padding: 14, overflow: "hidden" },
  cardUnread: { backgroundColor: "#fffdf7", borderColor: C.goldBrand },
  bar: { width: 4, borderRadius: 2 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  cardTitle: { fontFamily: serif, fontSize: 16, fontWeight: "700", color: C.ink, flexShrink: 1 },
  cardDate: { color: C.inkFaint, fontSize: 11 },
  cardBody: { color: C.inkMuted, fontSize: 14, lineHeight: 20, marginTop: 3 },
  cardOpen: { color: C.tealText, fontSize: 12, fontWeight: "700", marginTop: 6 },
});
