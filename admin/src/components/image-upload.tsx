import { useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from "react";
import { ApiError, api, getToken } from "@/lib/api";
import type { CloudinarySignature } from "@/lib/types";
import { BusyLabel } from "@/components/skeleton";

// Image upload. Prefers a signed Cloudinary upload (K9: the API signs the
// request into the staffer's own folder); when the API answers 503
// signed_uploads_unavailable it falls back to the first-party Go endpoint
// (POST /api/uploads). URL paste is the last resort. The value is always a URL.
const BASE = import.meta.env.VITE_API_URL ?? "";
const MAX_BYTES = 8 * 1024 * 1024;
const UPLOAD_FAILED = "Upload failed.";

const inputCls =
  "w-full rounded-lg border border-sand bg-paper px-3.5 py-2.5 text-ink placeholder:text-ink-faint focus:border-green-text focus:outline-none focus:ring-2 focus:ring-green/15";

function uploadError(res: Record<string, unknown>, status: number): Error {
  const err = res.error;
  if (typeof err === "string") return new Error(typeof res.message === "string" ? res.message : err);
  if (err && typeof err === "object" && typeof (err as { message?: unknown }).message === "string") {
    return new Error((err as { message: string }).message);
  }
  return new Error(`Upload failed (${status})`);
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
        else reject(uploadError(res, xhr.status));
      } catch { reject(new Error("Upload failed — unexpected response.")); }
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.send(fd);
  });
}

/** Asks the API for signed upload parameters; null means "use the fallback". */
async function signature(): Promise<CloudinarySignature | null> {
  try {
    return await api.cloudinarySignature();
  } catch (err) {
    if (err instanceof ApiError && err.status === 503) return null;
    throw err;
  }
}

async function upload(file: File, onProgress: (pct: number) => void): Promise<string> {
  const sig = await signature();
  const fd = new FormData();
  fd.append("file", file);
  if (!sig) return xhrUpload(`${BASE}/api/uploads`, fd, true, (r) => r.url as string | undefined, onProgress);
  if (file.size > sig.maxFileSize) throw new Error("That image is too large to upload.");
  // Post exactly the signed parameters (K9).
  fd.append("api_key", sig.apiKey);
  fd.append("timestamp", String(sig.timestamp));
  fd.append("signature", sig.signature);
  fd.append("folder", sig.folder);
  fd.append("allowed_formats", sig.allowedFormats);
  const url = sig.uploadUrl ?? `https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`;
  return xhrUpload(url, fd, false, (r) => r.secure_url as string | undefined, onProgress);
}

/** Pasted image URLs must be absolute http(s) links. */
function validImageUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/** A cover/photo picker (Cloudinary or first-party upload, or paste a URL). */
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
  // The pasted URL is a local draft, committed on blur/Enter — never per
  // keystroke (on Profile every onChange saves the photo).
  const [draft, setDraft] = useState("");

  function commitDraft() {
    const v = draft.trim();
    if (!v) return;
    if (!validImageUrl(v)) { setError("Paste a full image link starting with https://"); return; }
    setError(null);
    setManual(false);
    setDraft("");
    onChange(v);
  }

  function onDraftKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); commitDraft(); }
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Please choose an image file."); return; }
    if (file.size > MAX_BYTES) { setError("Image must be under 8 MB."); return; }
    setError(null); setBusy(true); setProgress(0);
    try {
      onChange(await upload(file, setProgress));
    } catch (err) {
      setError(err instanceof Error ? err.message : UPLOAD_FAILED);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  let picker: ReactNode;
  if (manual) {
    picker = (
        <input type="url" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commitDraft} onKeyDown={onDraftKey} placeholder="https://…" aria-label="Image URL" className={inputCls} />
    );
  } else if (value) {
    picker = (
        <div className="flex items-center gap-3">
          <img src={value} alt="" className="h-20 w-28 shrink-0 rounded-lg border border-sand object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.3"; }} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="rounded-full border border-sand px-3.5 py-1.5 text-sm font-medium text-ink-muted hover:border-green-text/40 disabled:opacity-60">
              {busy ? <BusyLabel label={`Uploading image, ${progress}% complete`} className="justify-center" /> : "Replace"}
            </button>
            <button type="button" onClick={() => onChange("")} className="rounded-full border border-maroon-text/30 px-3.5 py-1.5 text-sm font-medium text-maroon-text hover:bg-maroon-900/[0.06]">
              Remove
            </button>
          </div>
        </div>
    );
  } else {
    picker = (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-sand bg-paper px-4 py-7 text-center transition-colors hover:border-green-text/40 disabled:opacity-70"
        >
          {busy ? (
            <>
              <BusyLabel label={`Uploading image, ${progress}% complete`} width="w-20" />
              <span
                className="h-1.5 w-40 overflow-hidden rounded-full bg-sand"
                role="progressbar"
                aria-label="Image upload progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                aria-valuetext={`${progress}% complete`}
              >
                <span className="block h-full rounded-full bg-green transition-all" style={{ width: `${progress}%` }} />
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

      <input ref={inputRef} type="file" accept="image/*" onChange={onFile} className="hidden" />

      {error && <p className="mt-1.5 text-xs text-clay-text">{error}</p>}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-faint">
        <span>{hint}</span>
        {(!value || manual) && (
          <button type="button" onClick={() => { setManual(!manual); setDraft(""); setError(null); }} className="font-medium text-green-text underline">
            {manual ? "upload a file instead" : "or paste an image URL"}
          </button>
        )}
      </div>
    </div>
  );
}
