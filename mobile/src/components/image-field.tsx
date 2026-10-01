import { useMemo, useState } from "react";
import { Image, Linking, Platform, Pressable, StyleSheet, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { T as Text, TI as TextInput } from "@/components/typography";
import { useTheme } from "@/lib/theme-context";
import { type Palette, S } from "@/theme";
import { cldCover } from "@/lib/cloudinary";
import { API_BASE } from "@/lib/api";
import { getToken } from "@/lib/storage";

// Image upload. Prefers a signed Cloudinary upload (the API signs each request,
// POST /api/uploads/cloudinary-signature); when signing is unavailable it
// uploads to the first-party endpoint (POST /api/uploads). URL paste is the
// last resort. The value is always a URL.
// Identity documents never use this pipeline: see PrivateDocField below.

const UPLOAD_FAILED = "Upload failed.";

// React Native's FormData accepts a { uri, name, type } file descriptor.
function filePart(uri: string, name?: string, type?: string) {
  return { uri, name: name ?? "upload.jpg", type: type ?? "image/jpeg" } as unknown as Blob;
}

function authHeader(): Record<string, string> | undefined {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

interface CloudinarySignature {
  cloudName: string;
  apiKey: string;
  timestamp: number | string;
  signature: string;
  folder: string;
  allowedFormats?: string;
  uploadUrl?: string;
}

// Ask the API to sign a Cloudinary upload. Null means "use /api/uploads"
// (signing not configured, signed out, rate-limited or offline).
async function cloudinarySignature(): Promise<CloudinarySignature | null> {
  try {
    const res = await fetch(`${API_BASE}/api/uploads/cloudinary-signature`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeader() },
      body: JSON.stringify({ resourceType: "image" }),
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as CloudinarySignature | null;
    return data?.signature && data.apiKey && data.cloudName ? data : null;
  } catch {
    return null;
  }
}

async function uploadToCloudinary(sig: CloudinarySignature, file: Blob): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("api_key", sig.apiKey);
  fd.append("timestamp", String(sig.timestamp));
  fd.append("signature", sig.signature);
  fd.append("folder", sig.folder);
  if (sig.allowedFormats) fd.append("allowed_formats", sig.allowedFormats);
  const url = sig.uploadUrl ?? `https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`;
  const res = await fetch(url, { method: "POST", body: fd });
  const data = (await res.json().catch(() => ({}))) as { secure_url?: string; error?: { message?: string } };
  if (!res.ok || !data.secure_url) throw new Error(data.error?.message ?? UPLOAD_FAILED);
  return data.secure_url;
}

async function uploadImage(uri: string, name?: string, type?: string): Promise<string> {
  const sig = await cloudinarySignature();
  if (sig) return uploadToCloudinary(sig, filePart(uri, name, type));
  const fd = new FormData();
  fd.append("file", filePart(uri, name, type));
  const res = await fetch(`${API_BASE}/api/uploads`, { method: "POST", body: fd, headers: authHeader() });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error ?? UPLOAD_FAILED);
  return data.url;
}

type PickOutcome =
  | { kind: "asset"; asset: ImagePicker.ImagePickerAsset }
  | { kind: "cancelled" }
  | { kind: "denied"; settings: boolean };

// The system photo picker needs no permission on iOS (PHPicker runs out of
// process) or on Android 13+ (Photo Picker). Only older Android asks, and only
// when the member taps to add a photo.
function needsLibraryPermission(): boolean {
  return Platform.OS === "android" && Number(Platform.Version) < 33;
}

async function pickImage(): Promise<PickOutcome> {
  if (needsLibraryPermission()) {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return { kind: "denied", settings: !perm.canAskAgain };
  }
  // Compatible makes iOS hand back a JPEG instead of the HEIC original, which
  // the upload endpoints (JPG/PNG/WebP only) would refuse.
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.8,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
  if (result.canceled || !result.assets?.length) return { kind: "cancelled" };
  return { kind: "asset", asset: result.assets[0] };
}

const DENIED_MESSAGE = "Oguaa needs access to your photos only to attach the picture you choose.";
const DENIED_SETTINGS_MESSAGE = "Photo access is off for Oguaa. You can paste an image link below, or turn access on in Settings.";

function PermissionHint({ settings, s }: Readonly<{ settings: boolean; s: ReturnType<typeof makeStyles> }>) {
  return (
    <View style={s.permBox}>
      <Text style={s.error}>{settings ? DENIED_SETTINGS_MESSAGE : DENIED_MESSAGE}</Text>
      {settings ? (
        <Pressable accessibilityRole="button" onPress={() => { void Linking.openSettings(); }} style={s.btnGhost}>
          <Text style={s.btnGhostText}>Open Settings</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * An image picker for the mobile forms. Opens the photo library, uploads the
 * chosen image (signed Cloudinary or first-party), and stores the returned URL —
 * or paste an https URL. The value is always a URL string.
 */
export function ImageField({ value, onChange }: Readonly<{ value: string; onChange: (url: string) => void }>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState<null | { settings: boolean }>(null);
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);

  async function pick() {
    setError("");
    setDenied(null);
    const picked = await pickImage();
    if (picked.kind === "denied") { setDenied({ settings: picked.settings }); return; }
    if (picked.kind === "cancelled") return;
    const asset = picked.asset;
    setBusy(true);
    try {
      const url = await uploadImage(asset.uri, asset.fileName ?? undefined, asset.mimeType ?? undefined);
      onChange(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : UPLOAD_FAILED);
    } finally {
      setBusy(false);
    }
  }

  // Plain-http images are blocked on iOS and Android release builds, so a pasted
  // http:// link is switched to https://.
  function onPaste(text: string) {
    if (/^http:\/\//i.test(text)) {
      setError("Image links must use https:// — we switched this one for you.");
      onChange(text.replace(/^http:\/\//i, "https://"));
      return;
    }
    setError("");
    onChange(text);
  }

  if (value) {
    return (
      <View>
        <View style={s.row}>
          <Image source={{ uri: cldCover(value, 100) }} style={s.thumb} />
          <View style={{ gap: 8 }}>
            <Pressable accessibilityRole="button" onPress={pick} disabled={busy} style={s.btnGhost}>
              <Text style={s.btnGhostText}>{busy ? "Uploading…" : "Replace"}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => onChange("")} style={s.btnRemove}>
              <Text style={s.btnRemoveText}>Remove</Text>
            </Pressable>
          </View>
        </View>
        {error !== "" && <Text style={s.error}>{error}</Text>}
        {denied ? <PermissionHint settings={denied.settings} s={s} /> : null}
      </View>
    );
  }

  return (
    <View>
      <Pressable accessibilityRole="button" onPress={pick} disabled={busy} style={s.drop}>
        {busy ? (
          <View style={s.uploadSkeleton}>
            <View style={s.uploadSkeletonLineLg} />
            <View style={s.uploadSkeletonLineSm} />
          </View>
        ) : (
          <>
            <Text style={s.dropText}>Tap to upload an image</Text>
            <Text style={s.dropHint}>PNG or JPG, up to 8 MB</Text>
          </>
        )}
      </Pressable>
      <TextInput
        style={s.input}
        value={value}
        onChangeText={onPaste}
        placeholder="…or paste an https:// image link"
        placeholderTextColor={C.inkFaint}
        autoCapitalize="none"
        keyboardType="url"
      />
      {error !== "" && <Text style={s.error}>{error}</Text>}
      {denied ? <PermissionHint settings={denied.settings} s={s} /> : null}
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  thumb: { width: 84, height: 84, borderRadius: 12, borderWidth: 1, borderColor: C.sand, backgroundColor: C.cream },
  drop: { borderWidth: 2, borderStyle: "dashed", borderColor: C.sand, backgroundColor: C.cream, borderRadius: 12, paddingVertical: 28, alignItems: "center", justifyContent: "center", gap: 6 },
  uploadSkeleton: { width: "100%", alignItems: "center", justifyContent: "center", gap: 8 },
  uploadSkeletonLineLg: { width: 148, height: 12, borderRadius: 4, backgroundColor: C.sand },
  uploadSkeletonLineSm: { width: 112, height: 10, borderRadius: 4, backgroundColor: C.sand },
  dropText: { color: C.ink, fontSize: 15, ...S(600) },
  dropHint: { color: C.inkFaint, fontSize: 12 },
  btnGhost: { borderWidth: 1, borderColor: C.sand, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9, alignItems: "center" },
  btnGhostText: { color: C.inkMuted, fontSize: 13, ...S(600) },
  btnRemove: { borderWidth: 1, borderColor: C.clay, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9, alignItems: "center" },
  btnRemoveText: { color: C.clayText, fontSize: 13, ...S(600) },
  input: { marginTop: 10, borderWidth: 1, borderColor: C.sand, backgroundColor: C.cream, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.ink },
  error: { color: C.clayText, marginTop: 8, fontSize: 13 },
  permBox: { gap: 8, alignItems: "flex-start" },
  docRow: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  docText: { color: C.ink, fontSize: 14, ...S(600), flexShrink: 1 },
  docHint: { color: C.inkFaint, fontSize: 12, marginTop: 6 },
});

const PRIVATE_UNAVAILABLE = "Private document uploads are unavailable right now. Please try again later.";

async function uploadPrivate(uri: string, purpose: "agent_id" | "business_kyc", name?: string, type?: string): Promise<string> {
  const fd = new FormData();
  fd.append("file", filePart(uri, name, type));
  fd.append("purpose", purpose);
  const res = await fetch(`${API_BASE}/api/uploads/private`, { method: "POST", body: fd, headers: authHeader() });
  const data = (await res.json().catch(() => ({}))) as { ref?: string; error?: string; message?: string };
  if (res.status === 503) throw new Error(PRIVATE_UNAVAILABLE);
  if (!res.ok || !data.ref) throw new Error(data.message ?? data.error ?? UPLOAD_FAILED);
  return data.ref;
}

/**
 * Identity documents (Ghana Card, passport, driver's licence). Uploaded to the
 * API's encrypted private store (POST /api/uploads/private), readable only by
 * the member and the vetting team. The value is a `private:<id>` reference —
 * never a public URL, and nothing is shown back as an image.
 */
export function PrivateDocField({ value, onChange, purpose }: Readonly<{ value: string; onChange: (ref: string) => void; purpose: "agent_id" | "business_kyc" }>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState<null | { settings: boolean }>(null);
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);

  async function pick() {
    setError("");
    setDenied(null);
    const picked = await pickImage();
    if (picked.kind === "denied") { setDenied({ settings: picked.settings }); return; }
    if (picked.kind === "cancelled") return;
    setBusy(true);
    try {
      onChange(await uploadPrivate(picked.asset.uri, purpose, picked.asset.fileName ?? undefined, picked.asset.mimeType ?? undefined));
    } catch (e) {
      setError(e instanceof Error ? e.message : UPLOAD_FAILED);
    } finally {
      setBusy(false);
    }
  }

  const label = busy ? "Uploading…" : "Choose a photo of your ID";
  return (
    <View>
      {value ? (
        <View style={s.docRow}>
          <Text style={s.docText}>✓ ID document on file (private)</Text>
          <Pressable accessibilityRole="button" onPress={pick} disabled={busy} style={s.btnGhost}>
            <Text style={s.btnGhostText}>{busy ? "Uploading…" : "Replace"}</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable accessibilityRole="button" onPress={pick} disabled={busy} style={s.drop}>
          <Text style={s.dropText}>{label}</Text>
          <Text style={s.dropHint}>JPG, PNG or WebP, up to 5 MB</Text>
        </Pressable>
      )}
      <Text style={s.docHint}>Stored encrypted. Only you and the vetting team can open it.</Text>
      {error !== "" && <Text style={s.error}>{error}</Text>}
      {denied ? <PermissionHint settings={denied.settings} s={s} /> : null}
    </View>
  );
}
