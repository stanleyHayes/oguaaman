#!/usr/bin/env node
// Validates ios.privacyManifests in app.json against Apple's allowed values and
// the data types this app is known to collect. Run: node scripts/check-privacy-manifest.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const TYPES = [
  "Name", "EmailAddress", "PhoneNumber", "PhysicalAddress", "OtherUserContactInfo", "Health", "Fitness",
  "PaymentInfo", "CreditInfo", "OtherFinancialInfo", "PreciseLocation", "CoarseLocation", "SensitiveInfo",
  "Contacts", "EmailsOrTextMessages", "PhotosorVideos", "AudioData", "GameplayContent", "CustomerSupport",
  "OtherUserContent", "BrowsingHistory", "SearchHistory", "UserID", "DeviceID", "PurchaseHistory",
  "ProductInteraction", "AdvertisingData", "OtherUsageData", "CrashData", "PerformanceData",
  "OtherDiagnosticData", "EnvironmentScanning", "Hands", "Head", "OtherDataTypes",
].map((t) => `NSPrivacyCollectedDataType${t}`);
const PURPOSES = [
  "ThirdPartyAdvertising", "DeveloperAdvertising", "Analytics", "ProductPersonalization", "AppFunctionality", "Other",
].map((p) => `NSPrivacyCollectedDataTypePurpose${p}`);
// What the app and its backend collect today (see docs/apple_deployment.md).
const REQUIRED = [
  "Name", "EmailAddress", "PhoneNumber", "PhysicalAddress", "UserID", "PhotosorVideos", "OtherUserContent",
  "CustomerSupport", "PaymentInfo", "PurchaseHistory", "OtherFinancialInfo", "CoarseLocation", "SensitiveInfo",
  "ProductInteraction", "AdvertisingData", "OtherDataTypes",
].map((t) => `NSPrivacyCollectedDataType${t}`);

const appJson = JSON.parse(readFileSync(fileURLToPath(new URL("../app.json", import.meta.url)), "utf8"));
const ios = appJson.expo?.ios ?? {};
const manifest = ios.privacyManifests ?? {};
const errors = [];

if (ios.infoPlist && "NSPrivacyTracking" in ios.infoPlist) errors.push("NSPrivacyTracking belongs in privacyManifests, not infoPlist");
if (manifest.NSPrivacyTracking !== false) errors.push("NSPrivacyTracking must be false");
const declared = new Set();
for (const entry of manifest.NSPrivacyCollectedDataTypes ?? []) {
  const type = entry.NSPrivacyCollectedDataType;
  if (!TYPES.includes(type)) errors.push(`unknown data type ${type}`);
  if (declared.has(type)) errors.push(`duplicate data type ${type}`);
  declared.add(type);
  if (typeof entry.NSPrivacyCollectedDataTypeLinked !== "boolean") errors.push(`${type}: Linked must be a boolean`);
  if (entry.NSPrivacyCollectedDataTypeTracking !== false) errors.push(`${type}: Tracking must be false`);
  const purposes = entry.NSPrivacyCollectedDataTypePurposes ?? [];
  if (purposes.length === 0) errors.push(`${type}: needs at least one purpose`);
  for (const p of purposes) if (!PURPOSES.includes(p)) errors.push(`${type}: unknown purpose ${p}`);
}
for (const type of REQUIRED) if (!declared.has(type)) errors.push(`missing required data type ${type}`);

if (errors.length) {
  console.error(`Privacy manifest check failed:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log(`Privacy manifest OK (${declared.size} data types).`);
