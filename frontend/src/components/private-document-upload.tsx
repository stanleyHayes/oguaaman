import { useId, useRef, useState, type ChangeEvent } from "react";
import { api, apiErrorCode } from "@/lib/api";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

/**
 * Private document upload for ID and KYC papers (K8 / D6). The file goes to
 * POST /api/uploads/private, is stored encrypted and is readable only by the
 * owner and vetting staff — never at a public URL. The value is an opaque
 * `private:<id>` reference, so no preview is shown.
 */
export function PrivateDocumentUpload({
  value,
  onChange,
  purpose,
  label,
  hint,
  required = false,
  onRecord = false,
}: Readonly<{
  value: string;
  onChange: (ref: string) => void;
  purpose: "agent_id" | "business_kyc" | "document";
  label: string;
  hint?: string;
  required?: boolean;
  /** A copy is already stored server-side; a new upload replaces it. */
  onRecord?: boolean;
}>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    if (!ACCEPT.split(",").includes(file.type)) { setError("Choose a JPG, PNG, WebP or PDF file."); return; }
    if (file.size > MAX_BYTES) { setError("The file must be 5 MB or smaller."); return; }
    setError(null); setBusy(true);
    try {
      const res = await api.uploadPrivate(file, purpose);
      setFileName(file.name);
      onChange(res.ref);
    } catch (err) {
      if (apiErrorCode(err) === "private_uploads_unavailable") setError("Private document uploads are temporarily unavailable. Please try again later.");
      else setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  const uploaded = value !== "";
  const tick = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M5 13l4 4L19 7" /></svg>;
  let status = <span className="text-sm text-ink-faint">No file yet</span>;
  if (uploaded) {
    status = (
      <span className="inline-flex items-center gap-2 text-sm font-semibold text-green-text" role="status">
        {tick}
        {fileName ? `Uploaded privately ✓ (${fileName})` : "On record — held privately ✓"}
      </span>
    );
  } else if (onRecord) {
    status = <span className="inline-flex items-center gap-2 text-sm font-semibold text-green-text">{tick}A copy is on file</span>;
  }
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}{required && <span className="text-clay-text"> *</span>}
      </label>
      <input id={id} ref={inputRef} type="file" accept={ACCEPT} onChange={onFile} className="sr-only" />
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-sand bg-paper px-4 py-3">
        {status}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="ml-auto rounded-full border border-green/30 px-4 py-1.5 text-sm font-semibold text-green-text hover:border-green disabled:opacity-60"
        >
          {busy && "Uploading…"}
          {!busy && (uploaded || onRecord ? "Replace file" : "Choose file")}
        </button>
      </div>
      {hint && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
      {error && <p role="alert" className="mt-1 text-xs text-clay-text">{error}</p>}
    </div>
  );
}
