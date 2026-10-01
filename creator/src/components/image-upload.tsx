import { useRef, useState, type ReactNode, type ChangeEvent } from "react";
import { api, errorCode, getToken } from "@/lib/api";
import { BusyLabel, Skeleton } from "@/components/skeleton";
import { mediaUrl } from "@/lib/media";
import type { CloudinarySignature } from "@/lib/types";

// Image upload. Asks the API for a signed, per-member Cloudinary upload (POST
// /api/uploads/cloudinary-signature); when signed uploads aren't configured
// (503 signed_uploads_unavailable) it uploads through the first-party endpoint
// (POST /api/uploads) instead. No unsigned preset is ever used. URL paste is
// the last resort. The value is always a URL.
const BASE = import.meta.env.VITE_API_URL ?? "";

// What both upload paths accept (the server re-checks by content, not name).
const ALLOWED_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const ACCEPT = Object.keys(ALLOWED_TYPES).join(",");

// Remembered for the session once the API says signed uploads are off.
let signedUnavailable = false;

const inputCls =
  "min-h-11 w-full rounded-lg border border-sand bg-paper px-3.5 py-2.5 text-ink placeholder:text-ink-faint focus:border-green focus:outline-none focus:ring-2 focus:ring-green/15";

function errorMessage(res: Record<string, unknown>, status: number): string {
  const e = res.error;
  if (typeof res.message === "string" && res.message) return res.message;
  if (typeof e === "string" && e) return e;
  if (e && typeof e === "object" && typeof (e as { message?: unknown }).message === "string") return (e as { message: string }).message;
  return `Upload failed (${status})`;
}

function xhrUpload(url: string, fd: FormData, auth: boolean, pick: (r: Record<string, unknown>) => string | undefined, onProgress: (pct: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    if (auth) { const t = getToken(); if (t) xhr.setRequestHeader("Authorization", `Bearer ${t}`); }
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      try {
        const res = JSON.parse(xhr.responseText) as Record<string, unknown>;
        const got = pick(res);
        if (xhr.status >= 200 && xhr.status < 300 && got) resolve(got);
        else reject(new Error(errorMessage(res, xhr.status)));
      } catch { reject(new Error("Upload failed — unexpected response.")); }
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.send(fd);
  });
}

/** A signature for this upload, or null when signed uploads are off (use /api/uploads). */
async function signature(): Promise<CloudinarySignature | null> {
  if (signedUnavailable) return null;
  try {
    return await api.cloudinarySignature();
  } catch (e) {
    if (errorCode(e) === "signed_uploads_unavailable") { signedUnavailable = true; return null; }
    throw e;
  }
}

function checkFile(file: File, sig: CloudinarySignature | null): string | null {
  const ext = ALLOWED_TYPES[file.type];
  const allowed = sig ? sig.allowedFormats.split(",").map((f) => f.trim()) : Object.values(ALLOWED_TYPES);
  if (!ext || !allowed.includes(ext)) return "Please choose a JPG, PNG or WebP image.";
  const max = sig?.maxFileSize || DEFAULT_MAX_BYTES;
  if (file.size > max) return `Image must be under ${Math.round(max / (1024 * 1024))} MB.`;
  return null;
}

async function upload(file: File, onProgress: (pct: number) => void): Promise<string> {
  const sig = await signature();
  const problem = checkFile(file, sig);
  if (problem) throw new Error(problem);
  const fd = new FormData();
  fd.append("file", file);
  if (sig) {
    // Post every signed parameter exactly as given; the signature covers them.
    fd.append("api_key", sig.apiKey);
    fd.append("timestamp", String(sig.timestamp));
    fd.append("signature", sig.signature);
    fd.append("folder", sig.folder);
    fd.append("allowed_formats", sig.allowedFormats);
    return xhrUpload(sig.uploadUrl, fd, false, (r) => r.secure_url as string | undefined, onProgress);
  }
  return xhrUpload(`${BASE}/api/uploads`, fd, true, (r) => r.url as string | undefined, onProgress);
}

/** A cover/photo picker (signed Cloudinary or first-party upload, or paste a URL). */
export function ImageUpload({
  value,
  onChange,
  label = "Cover image (optional)",
  hint = "JPG, PNG or WebP, up to 8 MB.",
}: Readonly<{
  value: string;
  onChange: (url: string) => void;
  label?: string;
  hint?: string;
}>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [manualUrl, setManualUrl] = useState("");

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const problem = checkFile(file, null);
    if (problem) { setError(problem); if (inputRef.current) inputRef.current.value = ""; return; }
    setError(null); setBusy(true); setProgress(0);
    try {
      onChange(await upload(file, setProgress));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  let picker: ReactNode;
  if (value) {
    picker = (
        <div className="flex flex-wrap items-center gap-3">
          <img src={mediaUrl(value)} alt="" className="h-20 w-28 shrink-0 rounded-lg border border-sand object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.3"; }} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} aria-busy={busy || undefined} className="min-h-11 rounded-full border border-sand px-3.5 py-1.5 text-sm font-medium text-ink-muted hover:border-green/40 disabled:opacity-60">
              {busy ? <BusyLabel label={`Uploading image, ${progress}% complete`} width="w-16" /> : "Replace"}
            </button>
            <button type="button" onClick={() => onChange("")} className="min-h-11 rounded-full border border-maroon-text/30 px-3.5 py-1.5 text-sm font-medium text-maroon-text hover:bg-maroon-900/[0.06]">
              Remove
            </button>
          </div>
        </div>
    );
  } else if (manual) {
    picker = (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="url"
            value={manualUrl}
            onChange={(e) => setManualUrl(e.target.value)}
            placeholder="https://…"
            aria-label={`${label} URL`}
            className={inputCls}
          />
          <button
            type="button"
            onClick={() => onChange(manualUrl.trim())}
            disabled={!manualUrl.trim()}
            className="min-h-11 shrink-0 rounded-full bg-green px-4 text-sm font-semibold text-on-green transition-colors hover:bg-green-900 disabled:opacity-50"
          >
            Use URL
          </button>
        </div>
    );
  } else {
    picker = (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          aria-busy={busy || undefined}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-sand bg-paper px-4 py-7 text-center transition-colors hover:border-green/40 disabled:opacity-70"
        >
          {busy ? (
            <>
              <BusyLabel label={`Uploading image, ${progress}% complete`} width="w-24" />
              <span className="h-1.5 w-40 overflow-hidden rounded-full bg-sand">
                <Skeleton className="h-full rounded-full transition-[width]" style={{ width: `${progress}%` }} />
              </span>
            </>
          ) : (
            <>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-green-text" aria-hidden>
                <path d="M12 16V4M7 9l5-5 5 5" /><path d="M5 16v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3" />
              </svg>
              <span className="text-sm font-medium text-ink">Click to upload an image</span>
              <span className="text-xs text-ink-faint">JPG, PNG or WebP, up to 8 MB</span>
            </>
          )}
        </button>
    );
  }

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>

      {picker}

      <input ref={inputRef} type="file" accept={ACCEPT} onChange={onFile} className="hidden" />

      {error && <p className="mt-1.5 text-xs text-clay-text" role="alert">{error}</p>}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-faint">
        <span>{hint}</span>
        {!value && (
          <button type="button" onClick={() => setManual((m) => !m)} className="inline-flex min-h-11 items-center font-medium text-green-text underline">
            {manual ? "upload a file instead" : "or paste an image URL"}
          </button>
        )}
      </div>
    </div>
  );
}
