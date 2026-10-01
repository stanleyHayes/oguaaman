import { useRef, useState, type ChangeEvent} from "react";
import { uploadMedia } from "@/lib/upload";

// Image upload through lib/upload (signed Cloudinary when the API offers it,
// otherwise the first-party POST /api/uploads). A URL-paste toggle is the last
// resort. The stored value is always a URL string. Not for ID documents — use
// PrivateDocumentUpload.
const inputCls =
  "w-full rounded-lg border border-sand bg-paper px-3.5 py-2.5 text-ink placeholder:text-ink-faint focus:border-green focus:outline-none focus:ring-2 focus:ring-green/15";

/**
 * A cover/photo picker. Uploads the chosen file (Cloudinary or first-party) and
 * stores the returned URL; or paste a URL instead. The value is always a URL.
 */
export function ImageUpload({
  value,
  onChange,
  label = "Cover image (optional)",
  hint = "A photo — JPG, PNG or WebP, up to 8 MB.",
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

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Please choose an image file."); return; }
    if (file.size > 8 * 1024 * 1024) { setError("Image must be under 8 MB."); return; }
    setError(null); setBusy(true); setProgress(0);
    try {
      onChange(await uploadMedia(file, setProgress));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  // In URL mode the field stays mounted while typing (with a preview beside
  // it); swapping it for the preview would unmount it after one keystroke.
  const urlField = (
    <div className="flex min-w-0 items-start gap-3">
      {value && <img src={value} alt="" className="h-20 w-20 shrink-0 rounded-lg border border-sand object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.3"; }} />}
      <input type="url" value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://…" aria-label={`${label} URL`} className={inputCls} />
    </div>
  );

  const picker = (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      disabled={busy}
      className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-sand bg-paper px-4 py-7 text-center transition-colors hover:border-green/40 disabled:opacity-70"
    >
      {busy ? (
        <>
          <span className="text-sm font-medium text-ink">Uploading… {progress}%</span>
          <span className="h-1.5 w-40 overflow-hidden rounded-full bg-sand">
            <span className="block h-full rounded-full bg-green transition-all" style={{ width: `${progress}%` }} />
          </span>
        </>
      ) : (
        <>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-green" aria-hidden>
            <path d="M12 16V4M7 9l5-5 5 5" /><path d="M5 16v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3" />
          </svg>
          <span className="text-sm font-medium text-ink">Click to upload an image</span>
          <span className="text-xs text-ink-faint">JPG, PNG or WebP, up to 8 MB</span>
        </>
      )}
    </button>
  );

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>

      {manual && urlField}
      {!manual && value && (
        <div className="flex min-w-0 items-start gap-3">
          <img src={value} alt="" className="h-20 w-20 shrink-0 rounded-lg border border-sand object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.3"; }} />
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="w-full min-w-0 rounded-full border border-sand px-3 py-1.5 text-sm font-medium text-ink-muted hover:border-green/40 disabled:opacity-60 sm:w-auto">
              {busy ? `Uploading… ${progress}%` : "Replace"}
            </button>
            <button type="button" onClick={() => onChange("")} className="w-full min-w-0 rounded-full border border-maroon-900/30 px-3 py-1.5 text-sm font-medium text-maroon-900 hover:bg-maroon-900/[0.06] sm:w-auto">
              Remove
            </button>
          </div>
        </div>
      )}
      {!manual && !value && picker}

      <input ref={inputRef} type="file" accept="image/*" onChange={onFile} className="hidden" />

      {error && <p className="mt-1.5 text-xs text-clay-text">{error}</p>}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-faint">
        <span>{hint}</span>
        {(manual || !value) && (
          <button type="button" onClick={() => setManual((m) => !m)} className="font-medium text-green underline">
            {manual ? "upload a file instead" : "or paste an image URL"}
          </button>
        )}
      </div>
    </div>
  );
}
