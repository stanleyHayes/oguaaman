import { useEffect, useState } from "react";
import { Tabs } from "expo-router";
import { Text, type ColorValue } from "react-native";
import { C } from "@/theme";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";

const icon = (glyph: string) => {
  // Named so it has a display name (react/display-name) for the tab bar.
  function TabBarIcon({ color }: { color: ColorValue }) {
    return <Text style={{ fontSize: 17, color }}>{glyph}</Text>;
  }
  return TabBarIcon;
};

// Polls the unread-notification count so the More tab carries a re-engagement
// badge (remembrances, moderation outcomes). Only runs while signed in.
function useUnreadCount(): number {
  const { member } = useAuth();
  const [count, setCount] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting the badge when signed out
    if (!member) { setCount(0); return; }
    let alive = true;
    const tick = () => api.unreadCount().then((r) => { if (alive) setCount(r.count); }).catch(() => {});
    tick();
    const id = setInterval(tick, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, [member]);
  return count;
}

export default function TabsLayout() {
  const { t } = useLang();
  const unread = useUnreadCount();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: C.green,
        tabBarInactiveTintColor: C.inkFaint,
        tabBarStyle: { backgroundColor: C.cream, borderTopColor: C.sand },
        tabBarBadgeStyle: { backgroundColor: C.clay, color: C.cream, fontSize: 11 },
        headerStyle: { backgroundColor: C.green },
        headerTintColor: C.cream,
        headerTitleStyle: { fontWeight: "600" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t("nav.home"), headerShown: false, tabBarIcon: icon("◎") }} />
      <Tabs.Screen name="music" options={{ title: t("nav.music"), tabBarIcon: icon("♪") }} />
      <Tabs.Screen name="memoriam" options={{ title: t("nav.memoriam"), tabBarIcon: icon("♡") }} />
      <Tabs.Screen
        name="more"
        options={{
          title: t("nav.more"),
          tabBarIcon: icon("≡"),
          tabBarBadge: unread > 0 ? (unread > 9 ? "9+" : unread) : undefined,
        }}
      />
    </Tabs>
  );
}
