#!/usr/bin/env node
// Fails when a merged Android manifest requests a permission outside
// android-permissions.allowlist, leaves storage permissions uncapped, or allows
// cleartext traffic.
// Usage: node scripts/check-android-permissions.mjs <AndroidManifest.xml>
//   after `npx expo prebuild -p android --no-install`, pass
//   android/app/src/main/AndroidManifest.xml; for a release bundle, pass the
//   output of `bundletool dump manifest --bundle app.aab`.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/check-android-permissions.mjs <AndroidManifest.xml>");
  process.exit(2);
}
const allow = new Set(
  readFileSync(fileURLToPath(new URL("../android-permissions.allowlist", import.meta.url)), "utf8")
    .split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")),
);
const xml = readFileSync(file, "utf8");
const errors = [];
for (const m of xml.matchAll(/<uses-permission(?:-sdk-23)?\b([^>]*)>/g)) {
  const attrs = m[1];
  if (/tools:node="remove"/.test(attrs)) continue;
  const name = /android:name="([^"]+)"/.exec(attrs)?.[1];
  if (!name) continue;
  if (!allow.has(name)) errors.push(`not allowed: ${name}`);
  if (/_EXTERNAL_STORAGE$/.test(name) && !/android:maxSdkVersion="(\d+)"/.test(attrs)) errors.push(`${name} must carry maxSdkVersion="32"`);
}
if (/usesCleartextTraffic="true"/.test(xml)) errors.push('android:usesCleartextTraffic="true" is not allowed in a release manifest');
if (/android:debuggable="true"/.test(xml)) errors.push('android:debuggable="true" is not allowed in a release manifest');

if (errors.length) {
  console.error(`Android manifest check failed:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log("Android manifest permissions OK.");
