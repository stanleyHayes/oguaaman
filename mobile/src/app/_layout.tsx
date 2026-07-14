import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { C } from "@/theme";
import { AuthProvider } from "@/lib/auth";
import { LanguageProvider } from "@/lib/i18n";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <LanguageProvider>
      <AuthProvider>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: C.green },
            headerTintColor: C.cream,
            headerTitleStyle: { fontWeight: "600" },
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
          <Stack.Screen name="search" options={{ title: "Search", headerBackTitle: "More" }} />
        </Stack>
      </AuthProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
