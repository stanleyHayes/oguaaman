import { useId, useRef, useState, type ChangeEvent } from "react";
import type { MediaAsset } from "@/lib/types";
import { uploadMedia } from "@/lib/upload";
import { cldCover } from "@/lib/cloudinary";
import { EmptyState, EmptyGlyph } from "@/components/empty-state";

// A controlled photo/video gallery editor for the business storefront: add from
// device (multiple), delete, replace one, caption, and reorder. Enforces the
// per-kind cap (10 photos / 5 videos). The parent owns the array and persists it.
export function StorefrontMediaEditor({
  kind,
  items,
  max,
  onChange,
}: Readonly<{
  kind: "photo" | "video";
  items: MediaAsset[];
  max: number;
  onChange: (next: MediaAsset[]) => void;
}>) {
  const addRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replaceIndex = useRef<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const baseId = useId();
  const accept = kind === "video" ? "video/*" : "image/*";
  const maxMB = kind === "video" ? 100 : 8;
  const remaining = max - items.length;

  function newId() {
    return `${kind}-${Date.now()}-${Math.round(performance.now())}`;
  }

  async function uploadOne(file: File): Promise<MediaAsset | null> {
    if (!file.type.startsWith(kind === "video" ? "video/" : "image/")) {
      setError(`Please choose a ${kind} file.`);
      return null;
    }
    if (file.size > maxMB * 1024 * 1024) {
      setError(`Each ${kind} must be under ${maxMB} MB.`);
      return null;
    }
    const url = await uploadMedia(file, setProgress);
    return { id: newId(), url, kind, caption: "" };
  }

  async function onAdd(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, remaining);
    if (files.length === 0) return;
    setError(null);
    setBusy(true);
    setProgress(0);
    try {
      const added: MediaAsset[] = [];
      for (const f of files) {
        const asset = await uploadOne(f);
        if (asset) added.push(asset);
      }
      if (added.length) onChange([...items, ...added]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (addRef.current) addRef.current.value = "";
    }
  }

  async function onReplace(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const idx = replaceIndex.current;
    if (!file || idx == null) return;
    setError(null);
    setBusy(true);
    setProgress(0);
    try {
      const asset = await uploadOne(file);
      if (asset) onChange(items.map((m, i) => (i === idx ? { ...asset, id: m.id, caption: m.caption } : m)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      replaceIndex.current = null;
      if (replaceRef.current) replaceRef.current.value = "";
    }
  }

  function remove(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }
  function caption(i: number, value: string) {
    onChange(items.map((m, idx) => (idx === i ? { ...m, caption: value } : m)));
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink capitalize">{kind}s <span className="font-normal text-ink-faint">· {items.length}/{max}</span></p>
        <button
          type="button"
          onClick={() => addRef.current?.click()}
          disabled={busy || remaining <= 0}
          className="rounded-full bg-green px-3.5 py-1.5 text-sm font-semibold text-on-green transition-colors hover:bg-green-900 disabled:opacity-40"
        >
          {remaining <= 0 ? `Max ${max} reached` : `Add ${kind}s`}
        </button>
        <input ref={addRef} type="file" accept={accept} multiple hidden onChange={onAdd} aria-label={`Add ${kind}s`} />
        <input ref={replaceRef} type="file" accept={accept} hidden onChange={onReplace} aria-label={`Replace ${kind}`} />
      </div>

      {busy && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-sand" role="progressbar" aria-valuenow={progress}>
          <div className="h-full bg-green transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-clay-text">{error}</p>}

      {items.length === 0 ? (
        <div className="mt-3 rounded-[var(--radius-card)] border border-dashed border-sand bg-gradient-to-b from-cream to-cream/40">
          <EmptyState
            tone="green"
            icon={<EmptyGlyph name={kind === "video" ? "video" : "image"} size={34} />}
            title={kind === "video" ? "Show your place in motion" : "Bring your storefront to life"}
            description={kind === "video"
              ? `Add up to ${max} short videos from your device — a walkthrough, your kitchen, the view.`
              : `Add up to ${max} photos from your device — your space, products, team and signage.`}
            actions={
              <button
                type="button"
                onClick={() => addRef.current?.click()}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-on-green shadow-sm transition-colors hover:bg-green-900 disabled:opacity-50"
              >
                <span aria-hidden className="text-base leading-none">＋</span> Add {kind}s
              </button>
            }
            className="!py-12"
          />
        </div>
      ) : (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {items.map((m, i) => (
            <li key={m.id} className="overflow-hidden rounded-[var(--radius-card)] border border-sand bg-paper">
              {kind === "video" ? (
                <video src={m.url} controls preload="metadata" playsInline className="aspect-video w-full bg-black" />
              ) : (
                <img src={cldCover(m.url, 480)} alt={m.alt ?? ""} className="aspect-[4/3] w-full object-cover" />
              )}
              <div className="space-y-2 p-2.5">
                <input
                  id={`${baseId}-cap-${i}`}
                  value={m.caption ?? ""}
                  onChange={(e) => caption(i, e.target.value)}
                  placeholder="Caption (optional)"
                  className="w-full rounded-lg border border-sand bg-paper px-3 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:border-green focus:outline-none focus:ring-2 focus:ring-green/15"
                />
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="rounded-md border border-sand px-2 py-1 text-sm text-ink-muted hover:border-green/40 disabled:opacity-40">↑</button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Move down" className="rounded-md border border-sand px-2 py-1 text-sm text-ink-muted hover:border-green/40 disabled:opacity-40">↓</button>
                  <button type="button" onClick={() => { replaceIndex.current = i; replaceRef.current?.click(); }} disabled={busy} className="rounded-md border border-sand px-2.5 py-1 text-sm text-ink-muted hover:border-green/40">Replace</button>
                  <button type="button" onClick={() => remove(i)} aria-label="Delete" className="ml-auto rounded-md border border-sand px-2.5 py-1 text-sm text-ink-muted hover:border-clay hover:text-clay-text">Delete</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
