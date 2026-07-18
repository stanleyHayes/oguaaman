import { useEffect, useMemo, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import { Tabs } from "expo-router";
import { Pressable, StyleSheet, View, Animated, Easing, Keyboard, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme-context";
import { ON_GREEN, S, onFill, withAlpha, type Palette } from "@/theme";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { useDirectives } from "@/lib/directives";
import { AlertBanner } from "@/components/alert-banner";
import { useNavDrawer } from "@/components/nav-drawer";
import { TopBarActions } from "@/components/top-bar-actions";
import { CalendarIcon, GridIcon, HeartIcon, HomeIcon, MenuIcon, MusicIcon } from "@/components/icons";
import { T as Text } from "@/components/typography";

const WEB_EASE = Easing.bezier(0.22, 1, 0.36, 1);
const TAB_ICON_SIZE = 26;

// Match the portal's page-transition feel: the entering tab rises, scales in,
// and fades in while the leaving tab fades out. The larger translate/scale
// values and longer duration make the motion obvious on real devices.
function tabSceneInterpolator({ current }: Readonly<{ current: { progress: Animated.Value } }>) {
  const progress = current.progress;
  const sceneStyle: Animated.WithAnimatedValue<StyleProp<ViewStyle>> = {
    opacity: progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] }),
    transform: [
      { translateY: progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [12, 0, 12] }) },
      { scale: progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [0.985, 1, 0.985] }) },
    ],
  };
  return {
    sceneStyle,
  };
}

function TabGlyph({ focused, children }: Readonly<{ focused: boolean; children: (color: string) => ReactNode }>) {
  const { C } = useTheme();
  return (
    <View
      style={{
        width: 32,
        height: 27,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children(focused ? C.gold : C.onDarkText60)}
    </View>
  );
}

type TabsProps = ComponentProps<typeof Tabs>;
type TabBarRenderer = NonNullable<TabsProps["tabBar"]>;
type FloatingTabBarProps = Parameters<TabBarRenderer>[0];

/** Floating capsule navigation inspired by the supplied mobile reference. */
function FloatingTabBar({ state, descriptors, navigation, insets }: Readonly<FloatingTabBarProps>) {
  const { C } = useTheme();
  const s = useMemo(() => makeTabStyles(C), [C]);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const bottomInset = Math.max(insets.bottom, 8);
  const sideInset = Math.max(12, insets.left, insets.right);

  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hidden = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  if (keyboardVisible) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[s.tabBarStage, { height: 86 + bottomInset, paddingBottom: bottomInset, paddingHorizontal: sideInset }]}
    >
      <View style={s.tabBarDock} accessibilityRole="tablist">
        {state.routes.map((route, index) => {
          const descriptor = descriptors[route.key];
          const options = descriptor.options;
          const focused = state.index === index;
          const rawLabel = options.tabBarLabel ?? options.title ?? route.name;
          const label = typeof rawLabel === "string" ? rawLabel : route.name;
          const badge = options.tabBarBadge;
          const accessibilityLabel = badge == null
            ? (options.tabBarAccessibilityLabel ?? label)
            : `${options.tabBarAccessibilityLabel ?? label}, ${String(badge)} unread notifications`;
          const icon = options.tabBarIcon?.({ focused, color: focused ? C.gold : C.onDarkText60, size: TAB_ICON_SIZE });

          const onPress = () => {
            const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };
          const onLongPress = () => navigation.emit({ type: "tabLongPress", target: route.key });

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={accessibilityLabel}
              testID={options.tabBarButtonTestID}
              onPress={onPress}
              onLongPress={onLongPress}
              style={({ pressed }) => [s.tabItem, focused && s.tabItemActive, pressed && s.tabItemPressed]}
            >
              <View style={s.tabIconWrap}>
                {icon}
                {badge != null ? (
                  <View style={s.tabBadge}>
                    <Text maxFontSizeMultiplier={1.2} style={s.tabBadgeText}>{String(badge)}</Text>
                  </View>
                ) : null}
              </View>
              <Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={[s.tabLabel, focused && s.tabLabelActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

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
    <Pressable onPress={open} hitSlop={12} accessibilityLabel="Open menu" style={{ paddingHorizontal: 16, paddingVertical: 6 }} accessibilityRole="button">
      <MenuIcon size={24} color={ON_GREEN} strokeWidth={2} />
    </Pressable>
  );
}

export default function TabsLayout() {
  const { t } = useLang();
  const { C } = useTheme();
  const unread = useUnreadCount();
  const safeArea = useSafeAreaInsets();
  // The safety banner is rendered above the navigator; when it shows, it already
  // owns the top safe-area inset, so drop the header's own status-bar height to
  // avoid a double gap. When hidden, the header reclaims the notch as usual.
  const { bannerVisible } = useDirectives();
  const badgeText = unread > 9 ? "9+" : unread;
  return (
    <View style={{ flex: 1, backgroundColor: C.green }}>
      <AlertBanner />
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{
          // Enable the fade animation machinery with the built-in preset NAME
          // (importing TransitionPresets from "expo-router" is undefined here and
          // crashes), then override its spec + interpolator with the portal's
          // page-transition feel (fade + rise + scale) and a smoother duration.
          animation: "fade",
          transitionSpec: { animation: "timing", config: { duration: 260, easing: WEB_EASE } },
          sceneStyleInterpolator: tabSceneInterpolator,
          sceneStyle: { backgroundColor: C.paper, paddingBottom: 86 + Math.max(safeArea.bottom, 8) },
          // The custom floating dock reads these semantic colours for icons and
          // labels while preserving React Navigation's accessibility metadata.
          tabBarActiveTintColor: C.gold,
          tabBarInactiveTintColor: C.onDarkText60,
          tabBarHideOnKeyboard: true,
          headerStyle: { backgroundColor: C.green900 },
          headerTintColor: ON_GREEN,
          headerTitleStyle: { ...S(600), color: ON_GREEN, fontSize: 17 },
          headerStatusBarHeight: bannerVisible ? 0 : undefined,
          headerLeft: () => <HeaderMenuButton />,
          // Shared action cluster on every tab: theme toggle, alerts bell
          // (badged from the directives poll), and search.
          headerRight: () => <TopBarActions />,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t("nav.home"),
            headerShown: false,
            tabBarIcon: ({ focused }) => <TabGlyph focused={focused}>{(color) => <HomeIcon size={TAB_ICON_SIZE - 2} color={color} strokeWidth={2} />}</TabGlyph>,
          }}
        />
        <Tabs.Screen
          name="music"
          options={{
            title: t("nav.music"),
            tabBarIcon: ({ focused }) => <TabGlyph focused={focused}>{(color) => <MusicIcon size={TAB_ICON_SIZE - 2} color={color} strokeWidth={2} />}</TabGlyph>,
          }}
        />
        <Tabs.Screen
          name="memoriam"
          options={{
            title: t("nav.memoriam"),
            tabBarIcon: ({ focused }) => <TabGlyph focused={focused}>{(color) => <HeartIcon size={TAB_ICON_SIZE - 2} color={color} strokeWidth={2} />}</TabGlyph>,
          }}
        />
        <Tabs.Screen
          name="events"
          options={{
            title: t("nav.events") ?? "Events",
            tabBarIcon: ({ focused }) => <TabGlyph focused={focused}>{(color) => <CalendarIcon size={TAB_ICON_SIZE - 2} color={color} strokeWidth={2} />}</TabGlyph>,
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: t("nav.more"),
            tabBarIcon: ({ focused }) => <TabGlyph focused={focused}>{(color) => <GridIcon size={TAB_ICON_SIZE - 2} color={color} strokeWidth={2} />}</TabGlyph>,
            tabBarBadge: unread > 0 ? badgeText : undefined,
          }}
        />
      </Tabs>
    </View>
  );
}

const makeTabStyles = (C: Palette) => StyleSheet.create({
  tabBarStage: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "transparent",
    paddingTop: 7,
  },
  tabBarDock: {
    minHeight: 71,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 34,
    borderWidth: 1,
    borderColor: withAlpha(C.cream, 0.16),
    backgroundColor: C.green900,
    paddingHorizontal: 6,
    paddingVertical: 5,
    shadowColor: C.green900,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.24,
    shadowRadius: 14,
    elevation: 16,
  },
  tabItem: {
    flex: 1,
    minWidth: 0,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderRadius: 28,
    paddingHorizontal: 3,
    paddingVertical: 4,
  },
  tabItemActive: {
    backgroundColor: withAlpha(C.cream, 0.15),
    borderWidth: 1,
    borderColor: withAlpha(C.cream, 0.08),
  },
  tabItemPressed: { opacity: 0.68, transform: [{ scale: 0.97 }] },
  tabIconWrap: { minHeight: 27, alignItems: "center", justifyContent: "center" },
  tabLabel: { ...S(500), maxWidth: "100%", color: C.onDarkText60, fontSize: 10.5, lineHeight: 14, letterSpacing: 0.05 },
  tabLabelActive: { ...S(700), color: ON_GREEN },
  tabBadge: {
    position: "absolute",
    right: -8,
    top: -5,
    minWidth: 19,
    height: 19,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 2,
    borderColor: C.green900,
    backgroundColor: C.clay,
    paddingHorizontal: 4,
  },
  tabBadgeText: { ...S(700), color: onFill(C.clay), fontSize: 9, lineHeight: 12 },
});
