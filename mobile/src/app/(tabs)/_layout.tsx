import { useEffect, useState } from "react";
import { Tabs, TransitionPresets } from "expo-router";
import { Pressable, View, Animated, Easing, type ColorValue, type ViewStyle } from "react-native";
import { T as Text } from "@/components/typography";
import { useTheme } from "@/lib/theme-context";
import { ON_GREEN, S, D } from "@/theme";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { useDirectives } from "@/lib/directives";
import { AlertBanner } from "@/components/alert-banner";
import { useNavDrawer } from "@/components/nav-drawer";
import { TopBarActions } from "@/components/top-bar-actions";

const WEB_EASE = Easing.bezier(0.22, 1, 0.36, 1);

// Match the portal's page-transition feel: the entering tab rises, scales in,
// and fades in while the leaving tab fades out. The larger translate/scale
// values and longer duration make the motion obvious on real devices.
function tabSceneInterpolator({ current }: Readonly<{ current: { progress: Animated.Value } }>) {
  const progress = current.progress;
  return {
    sceneStyle: {
      opacity: progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] }),
      transform: [
        { translateY: progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [28, 0, 28] }) },
        { scale: progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [0.96, 1, 0.96] }) },
      ],
    } as Animated.AnimatedStyleProp<ViewStyle>,
  };
}

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
  const { C } = useTheme();
  return (
    <Pressable onPress={open} hitSlop={12} accessibilityLabel="Open menu" style={{ paddingHorizontal: 16, paddingVertical: 6 }} accessibilityRole="button">
      <Text style={{ fontSize: 20, color: ON_GREEN, ...S(700) }}>☰</Text>
    </Pressable>
  );
}

export default function TabsLayout() {
  const { t } = useLang();
  const { C } = useTheme();
  const unread = useUnreadCount();
  // The safety banner is rendered above the navigator; when it shows, it already
  // owns the top safe-area inset, so drop the header's own status-bar height to
  // avoid a double gap. When hidden, the header reclaims the notch as usual.
  const { bannerVisible } = useDirectives();
  const badgeText = unread > 9 ? "9+" : unread;
  return (
    <View style={{ flex: 1, backgroundColor: C.green }}>
      <AlertBanner />
      <Tabs
        screenOptions={{
          // Use React Navigation's built-in fade preset so the interpolator is
          // actually wired, then override it with the portal's page-transition
          // feel (fade + rise + scale) and a longer, smoother duration.
          ...TransitionPresets.FadeTransition,
          transitionSpec: { animation: "timing", config: { duration: 320, easing: WEB_EASE } },
          sceneStyleInterpolator: tabSceneInterpolator,
          tabBarActiveTintColor: C.greenText,
          tabBarInactiveTintColor: C.inkFaint,
          tabBarStyle: { backgroundColor: C.cream, borderTopColor: C.sand },
          tabBarBadgeStyle: { backgroundColor: C.clay, color: ON_GREEN, fontSize: 11 },
          headerStyle: { backgroundColor: C.green },
          headerTintColor: ON_GREEN,
          headerTitleStyle: { ...D(600) },
          headerStatusBarHeight: bannerVisible ? 0 : undefined,
          headerLeft: () => <HeaderMenuButton />,
          // Shared action cluster on every tab: theme toggle, alerts bell
          // (badged from the directives poll), and search.
          headerRight: () => <TopBarActions />,
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
    </View>
  );
}
