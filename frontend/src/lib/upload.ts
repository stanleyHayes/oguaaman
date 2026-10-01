// Device media upload (photos and storefront video). Uses a server-signed
// Cloudinary upload into the member's own folder (K9) when the API has
// Cloudinary configured — CDN delivery + transforms — otherwise the
// first-party Go endpoint (POST /api/uploads). No unsigned preset is used.
// The stored value is always a URL string. ID and KYC documents never come
// here: they go through api.uploadPrivate.
import { api, apiErrorCode, getToken, type CloudinarySignature } from "@/lib/api";

const BASE = import.meta.env.VITE_API_URL ?? "";

// Once the API says signed uploads are unavailable, stop asking for this page load.
let signedUnavailable = false;

function xhrUpload(
  url: string,
  fd: FormData,
  auth: boolean,
  pick: (r: Record<string, unknown>) => string | undefined,
  onProgress: (pct: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    if (auth) {
      const t = getToken();
      if (t) xhr.setRequestHeader("Authorization", `Bearer ${t}`);
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const res = JSON.parse(xhr.responseText) as Record<string, unknown>;
        const got = pick(res);
        const err = res.error as string | { message?: string } | undefined;
        if (xhr.status >= 200 && xhr.status < 300 && got) resolve(got);
        else reject(new Error((typeof err === "string" ? err : err?.message) ?? `Upload failed (${xhr.status})`));
      } catch {
        reject(new Error("Upload failed — unexpected response."));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.send(fd);
  });
}

async function signature(resourceType: "image" | "video"): Promise<CloudinarySignature | null> {
  if (signedUnavailable) return null;
  try {
    return await api.cloudinarySignature(resourceType);
  } catch (err) {
    if (apiErrorCode(err) === "signed_uploads_unavailable") signedUnavailable = true;
    else throw err;
    return null;
  }
}

function signedUpload(file: File, sig: CloudinarySignature, onProgress: (pct: number) => void): Promise<string> {
  if (sig.maxFileSize && file.size > sig.maxFileSize) {
    return Promise.reject(new Error(`That file is too large — the limit is ${Math.round(sig.maxFileSize / (1024 * 1024))} MB.`));
  }
  const resource = sig.resourceType ?? (file.type.startsWith("video/") ? "video" : "image");
  const fd = new FormData();
  fd.append("file", file);
  fd.append("api_key", sig.apiKey);
  fd.append("timestamp", String(sig.timestamp));
  fd.append("signature", sig.signature);
  fd.append("folder", sig.folder);
  fd.append("allowed_formats", sig.allowedFormats);
  const url = sig.uploadUrl ?? `https://api.cloudinary.com/v1_1/${encodeURIComponent(sig.cloudName)}/${resource}/upload`;
  return xhrUpload(url, fd, false, (r) => r.secure_url as string | undefined, onProgress);
}

/** Upload a photo or video from the device; resolves to the stored URL. */
export async function uploadMedia(file: File, onProgress: (pct: number) => void): Promise<string> {
  const sig = await signature(file.type.startsWith("video/") ? "video" : "image");
  if (sig) return signedUpload(file, sig, onProgress);
  const fd = new FormData();
  fd.append("file", file);
  return xhrUpload(`${BASE}/api/uploads`, fd, true, (r) => r.url as string | undefined, onProgress);
}
