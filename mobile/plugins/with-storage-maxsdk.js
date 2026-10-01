// Caps the legacy external-storage permissions at Android 12L (API 32).
// expo-image-picker declares them with maxSdkVersion="32", but a template or
// another library can re-declare them without the cap, and the merged release
// manifest would then ask for broad storage access on every Android version.
// Android 13+ uses the system Photo Picker, which needs no permission at all.
const { withAndroidManifest } = require("expo/config-plugins");

const CAPPED = new Set([
  "android.permission.READ_EXTERNAL_STORAGE",
  "android.permission.WRITE_EXTERNAL_STORAGE",
]);

module.exports = function withStorageMaxSdk(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    for (const perm of manifest["uses-permission"] ?? []) {
      if (CAPPED.has(perm.$["android:name"])) perm.$["android:maxSdkVersion"] = "32";
    }
    return cfg;
  });
};
