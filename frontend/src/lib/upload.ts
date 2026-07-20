// Device media upload for the storefront gallery. Prefers Cloudinary (unsigned
// preset) when configured — it handles both images and video and gives CDN
// delivery + transforms; otherwise it falls back to the first-party Go endpoint
// (POST /api/uploads). The stored value is always a URL string.
import { getToken } from "@/lib/api";

const BASE = import.meta.env.VITE_API_URL ?? "";
const CLOUD = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined;
const PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string | undefined;
export const cloudinaryConfigured = Boolean(CLOUD && PRESET);

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
        if (xhr.status >= 200 && xhr.status < 300 && got) resolve(got);
        else reject(new Error((res.error as string) ?? (res.error as { message?: string })?.message ?? `Upload failed (${xhr.status})`));
      } catch {
        reject(new Error("Upload failed — unexpected response."));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.send(fd);
  });
}

/** Upload a photo or video from the device; resolves to the stored URL. */
export function uploadMedia(file: File, onProgress: (pct: number) => void): Promise<string> {
  const isVideo = file.type.startsWith("video/");
  if (cloudinaryConfigured) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("upload_preset", PRESET as string);
    const resource = isVideo ? "video" : "image";
    return xhrUpload(`https://api.cloudinary.com/v1_1/${CLOUD}/${resource}/upload`, fd, false, (r) => r.secure_url as string | undefined, onProgress);
  }
  const fd = new FormData();
  fd.append("file", file);
  return xhrUpload(`${BASE}/api/uploads`, fd, true, (r) => r.url as string | undefined, onProgress);
}
