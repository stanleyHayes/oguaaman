import { useEffect, useState } from "react";
import { Tabs } from "expo-router";
import { Pressable, Text, type ColorValue } from "react-native";
import { C } from "@/theme";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { useNavDrawer } from "@/components/nav-drawer";

const icon = (glyph: string) => {
  // Named so it has a display name (react/display-name) for the tab bar.
  function TabBarIcon({ color }: Readonly<{ color: ColorValue }>) {
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

// ☰ in the green top bar — opens the section drawer (the links that used to
// be the More tab's content).
function HeaderMenuButton() {
  const { open } = useNavDrawer();
  return (
    <Pressable onPress={open} hitSlop={12} accessibilityLabel="Open menu" style={{ paddingHorizontal: 16, paddingVertical: 6 }}>
      <Text style={{ fontSize: 20, color: C.cream, fontWeight: "700" }}>☰</Text>
    </Pressable>
  );
}

export default function TabsLayout() {
  const { t } = useLang();
  const unread = useUnreadCount();
  const badgeText = unread > 9 ? "9+" : unread;
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
        headerLeft: () => <HeaderMenuButton />,
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
          tabBarBadge: unread > 0 ? badgeText : undefined,
        }}
      />
    </Tabs>
  );
}
