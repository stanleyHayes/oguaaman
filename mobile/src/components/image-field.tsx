import { useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { T as Text, TI as TextInput } from "@/components/typography";
import { useTheme } from "@/lib/theme-context";
import { type Palette, S } from "@/theme";
import { cldCover } from "@/lib/cloudinary";
import { API_BASE } from "@/lib/api";
import { getToken } from "@/lib/storage";

// Image upload. Prefers Cloudinary (unsigned preset) when configured; otherwise
// uploads to the first-party Go endpoint (POST /api/uploads) so uploads work out
// of the box. URL paste is the last resort. The value is always a URL.
const CLOUD = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
const PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
const cloudinaryConfigured = Boolean(CLOUD && PRESET);

// React Native's FormData accepts a { uri, name, type } file descriptor.
function filePart(uri: string, name?: string, type?: string) {
  return { uri, name: name ?? "upload.jpg", type: type ?? "image/jpeg" } as unknown as Blob;
}

async function uploadImage(uri: string, name?: string, type?: string): Promise<string> {
  const fd = new FormData();
  fd.append("file", filePart(uri, name, type));
  if (cloudinaryConfigured) {
    fd.append("upload_preset", PRESET as string);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, { method: "POST", body: fd });
    const data = (await res.json().catch(() => ({}))) as { secure_url?: string; error?: { message?: string } };
    if (!res.ok || !data.secure_url) throw new Error(data.error?.message ?? "Upload failed.");
    return data.secure_url;
  }
  const token = getToken();
  const res = await fetch(`${API_BASE}/api/uploads`, {
    method: "POST",
    body: fd,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error ?? "Upload failed.");
  return data.url;
}

/**
 * An image picker for the mobile forms. Opens the photo library, uploads the
 * chosen image (Cloudinary or first-party), and stores the returned URL — or
 * paste a URL. The value is always a URL string.
 */
export function ImageField({ value, onChange }: Readonly<{ value: string; onChange: (url: string) => void }>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);

  async function pick() {
    setError("");
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError("Allow photo access to upload an image.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setBusy(true);
    try {
      const url = await uploadImage(asset.uri, asset.fileName ?? undefined, asset.mimeType ?? undefined);
      onChange(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
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
        onChangeText={onChange}
        placeholder="…or paste an image URL"
        placeholderTextColor={C.inkFaint}
        autoCapitalize="none"
        keyboardType="url"
      />
      {error !== "" && <Text style={s.error}>{error}</Text>}
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
});
