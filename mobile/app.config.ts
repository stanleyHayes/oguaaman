import type { ConfigContext, ExpoConfig } from "expo/config";

// app.json holds the static config; this file only adds release guards.
// A store build must talk to the API over HTTPS — never localhost, never http.
export default ({ config }: ConfigContext): ExpoConfig => {
  const profile = process.env.EAS_BUILD_PROFILE;
  if (profile === "production") {
    const api = process.env.EXPO_PUBLIC_API_URL ?? "";
    if (!api.startsWith("https://")) {
      throw new Error(`Production builds need EXPO_PUBLIC_API_URL set to an https:// URL (got "${api || "unset"}").`);
    }
    if (process.env.EXPO_PUBLIC_SIMULATE_PAYMENTS === "true") {
      throw new Error("Production builds must not enable EXPO_PUBLIC_SIMULATE_PAYMENTS.");
    }
  }
  return config as ExpoConfig;
};
