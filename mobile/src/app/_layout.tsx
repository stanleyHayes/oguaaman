import { useEffect } from "react";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import * as SystemUI from "expo-system-ui";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import {
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
} from "@expo-google-fonts/outfit";
import {
  Fraunces_600SemiBold,
  Fraunces_600SemiBold_Italic,
  Fraunces_700Bold,
} from "@expo-google-fonts/fraunces";
import { AuthProvider } from "@/lib/auth";
import { LanguageProvider } from "@/lib/i18n";
import { ThemeProvider, useTheme } from "@/lib/theme-context";
import { DirectivesProvider } from "@/lib/directives";
import { NavDrawerProvider } from "@/components/nav-drawer";

// Keep the splash screen up until the brand fonts are ready, so the first
// frame never flashes system type.
void SplashScreen.preventAutoHideAsync().catch(() => {});

/*
 * Phase D theme migration — the reference transform for every screen:
 *
 *   Before (static palette, can't follow the theme):
 *     import { C } from "@/theme";
 *     const s = StyleSheet.create({ card: { backgroundColor: C.cream } });
 *
 *   After (palette-aware):
 *     import { type Palette } from "@/theme";
 *     import { useTheme } from "@/lib/theme-context";
 *     const makeStyles = (C: Palette) =>
 *       StyleSheet.create({ card: { backgroundColor: C.cream } });
 *     // inside the component:
 *     const { C } = useTheme();
 *     const s = useMemo(() => makeStyles(C), [C]);
 *
 * The factory parameter is named C so the style bodies don't change at all;
 * inline `C.xxx` usages in JSX keep working after `const { C } = useTheme()`.
 * This file has no StyleSheet, so its migration is just reading C from
 * useTheme() inside RootNavigator below.
 */

function RootNavigator() {
  const { C } = useTheme();

  // Keep the OS-level window background in step with the palette so overscroll
  // and transition gaps never flash the wrong color.
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(C.paper).catch(() => {});
  }, [C]);

  return (
    <>
      {/* Headers stay dark green in BOTH palettes, so the status bar content
          is always light. */}
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: C.green },
          headerTintColor: C.cream,
          headerTitleStyle: { fontFamily: "Fraunces_600SemiBold" },
          contentStyle: { backgroundColor: C.paper },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="music/[slug]" options={{ title: "Artist", headerBackTitle: "Music" }} />
        <Stack.Screen name="memoriam/[slug]" options={{ title: "In Memoriam", headerBackTitle: "Yɛnkae" }} />
        <Stack.Screen name="signin" options={{ title: "Sign in", presentation: "modal" }} />
        <Stack.Screen name="submit" options={{ title: "Contribute", presentation: "modal", headerBackTitle: "More" }} />
        <Stack.Screen name="browse/[type]" options={{ title: "Browse", headerBackTitle: "More" }} />
        <Stack.Screen name="news/index" options={{ title: "Newsroom", headerBackTitle: "More" }} />
        <Stack.Screen name="news/[slug]" options={{ title: "Newsroom", headerBackTitle: "News" }} />
        <Stack.Screen name="members/[slug]" options={{ title: "Member", headerBackTitle: "Back" }} />
        <Stack.Screen name="institutions/index" options={{ title: "Institutions", headerBackTitle: "More" }} />
        <Stack.Screen name="institutions/[slug]" options={{ title: "Institution", headerBackTitle: "Institutions" }} />
        <Stack.Screen name="people/[slug]" options={{ title: "Person", headerBackTitle: "Back" }} />
        <Stack.Screen name="business/[slug]" options={{ title: "Business", headerBackTitle: "Back" }} />
        <Stack.Screen name="legal/[doc]" options={{ title: "Legal", headerBackTitle: "More" }} />
        <Stack.Screen name="explore/[topic]" options={{ title: "Explore", headerBackTitle: "More" }} />
        <Stack.Screen name="projects/index" options={{ title: "Adopt a project", headerBackTitle: "More" }} />
        <Stack.Screen name="projects/[slug]" options={{ title: "Project", headerBackTitle: "Projects" }} />
        <Stack.Screen name="safety/index" options={{ title: "Safety", headerBackTitle: "More" }} />
        <Stack.Screen name="safety/[slug]" options={{ title: "Safety", headerBackTitle: "Safety" }} />
        <Stack.Screen name="safety/report" options={{ title: "Report an incident", headerBackTitle: "Safety" }} />
        <Stack.Screen name="lost-found/index" options={{ title: "Lost & Found", headerBackTitle: "More" }} />
        <Stack.Screen name="lost-found/[slug]" options={{ title: "Lost & Found", headerBackTitle: "Lost & Found" }} />
        <Stack.Screen name="lost-found/new" options={{ title: "Post a notice", headerBackTitle: "Lost & Found" }} />
        <Stack.Screen name="festivals/index" options={{ title: "Festivals", headerBackTitle: "More" }} />
        <Stack.Screen name="festivals/[slug]" options={{ title: "Festival", headerBackTitle: "Festivals" }} />
        <Stack.Screen name="events/[slug]" options={{ title: "Event", headerBackTitle: "Back" }} />
        <Stack.Screen name="music/the-oguaa-sound" options={{ title: "The Oguaa Sound", headerBackTitle: "Music" }} />
        <Stack.Screen name="me" options={{ title: "My profile", headerBackTitle: "More" }} />
        <Stack.Screen name="notifications" options={{ title: "Notifications", headerBackTitle: "Back" }} />
        <Stack.Screen name="alerts" options={{ title: "Alerts", headerBackTitle: "Back" }} />
        <Stack.Screen name="search" options={{ title: "Search", headerBackTitle: "More" }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    Fraunces_600SemiBold,
    Fraunces_600SemiBold_Italic,
    Fraunces_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <LanguageProvider>
        <AuthProvider>
          <DirectivesProvider>
            <NavDrawerProvider>
              <RootNavigator />
            </NavDrawerProvider>
          </DirectivesProvider>
        </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
