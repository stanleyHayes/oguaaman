import { useState, type ReactNode } from "react";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePageTitle } from "@/lib/use-page-title";
import { Container } from "@/components/ui";
import { StorefrontMediaEditor } from "@/components/storefront-media-editor";
import { storefrontUrl, storefrontUrlParts } from "@/lib/storefront-url";
import type { Listing, ProfileSection, ProfileSectionType, SectionItem } from "@/lib/types";

export async function loader({ params }: LoaderFunctionArgs) {
  const business = await api.business(params.slug as string);
  return { business };
}

const field =
  "w-full rounded-lg border border-sand bg-paper px-3.5 py-2.5 text-ink placeholder:text-ink-faint focus:border-green focus:outline-none focus:ring-2 focus:ring-green/15";

// The storefront section kinds an owner can add here (a focused subset of the
// full engine; the public renderer supports them all).
const SECTION_KINDS: { type: ProfileSectionType; label: string; shape: "body" | "items" | "quote" }[] = [
  { type: "richtext", label: "Text (about / story)", shape: "body" },
  { type: "menu", label: "Menu / price list", shape: "items" },
  { type: "schedule", label: "Hours / schedule", shape: "items" },
  { type: "quote", label: "Quote / tagline", shape: "quote" },
];

function shapeOf(type: string): "body" | "items" | "quote" {
  return SECTION_KINDS.find((k) => k.type === type)?.shape ?? "body";
}
function stripTmp(id?: string) {
  return id && id.startsWith("tmp-") ? "" : (id ?? "");
}

export function Component() {
  const { business: initial } = useLoaderData() as { business: Listing };
  const { member } = useAuth();
  usePageTitle(`Manage ${initial.title}`);

  const [handle, setHandle] = useState(initial.handle ?? "");
  const [sections, setSections] = useState<ProfileSection[]>(initial.sections ?? []);
  const [photos, setPhotos] = useState(initial.photos ?? []);
  const [videos, setVideos] = useState(initial.videos ?? []);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const isOwner = member != null && (member.id === initial.ownerId || member.role === "curator" || member.role === "steward");
  const isSupporter = Boolean(initial.supporter) || member?.role === "curator" || member?.role === "steward";

  if (member == null) {
    return (
      <Gate title="Sign in to manage your storefront">
        <Link to="/signin" className="cta">Sign in</Link>
      </Gate>
    );
  }
  if (!isOwner) {
    return (
      <Gate title="Not your business to manage">
        <p className="mt-3 text-ink-muted">Only the owner can edit {initial.title}’s storefront.</p>
        <Link to={`/business/${initial.slug}`} className="mt-6 inline-block cta">Back to {initial.title}</Link>
      </Gate>
    );
  }
  if (!isSupporter) {
    return (
      <Gate title="Build your storefront with Oguaa Supporter">
        <p className="mt-3 text-ink-muted">
          The storefront — a photo &amp; video gallery, custom sections and your own shareable link — is a Supporter feature.
          Subscribe on your business page to unlock it.
        </p>
        <Link to={`/business/${initial.slug}?subscribe=1`} className="mt-6 inline-block cta">Become a Supporter</Link>
      </Gate>
    );
  }

  function addSection(type: ProfileSectionType) {
    setSections((cur) => [...cur, { id: `tmp-${type}-${Date.now()}`, type, title: "", tone: "green", body: "", items: [] }]);
    setState("idle");
  }
  function patch(i: number, p: Partial<ProfileSection>) {
    setSections((cur) => cur.map((s, idx) => (idx === i ? { ...s, ...p } : s)));
    setState("idle");
  }
  function moveSection(i: number, dir: -1 | 1) {
    setSections((cur) => {
      const j = i + dir;
      if (j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function removeSection(i: number) {
    setSections((cur) => cur.filter((_, idx) => idx !== i));
  }
  function patchItem(si: number, ii: number, p: Partial<SectionItem>) {
    setSections((cur) => cur.map((s, idx) => (idx === si ? { ...s, items: (s.items ?? []).map((it, j) => (j === ii ? { ...it, ...p } : it)) } : s)));
  }
  function addItem(si: number) {
    setSections((cur) => cur.map((s, idx) => (idx === si ? { ...s, items: [...(s.items ?? []), { id: `tmp-i-${Date.now()}`, label: "", value: "", detail: "" }] } : s)));
  }
  function removeItem(si: number, ii: number) {
    setSections((cur) => cur.map((s, idx) => (idx === si ? { ...s, items: (s.items ?? []).filter((_, j) => j !== ii) } : s)));
  }

  async function save() {
    setState("saving");
    setError(null);
    try {
      const payload = {
        handle: handle.trim(),
        sections: sections.map((s) => ({ ...s, id: stripTmp(s.id), items: (s.items ?? []).map((it) => ({ ...it, id: stripTmp(it.id) })) })),
        photos,
        videos,
      };
      const updated = await api.setStorefront(initial.id, payload);
      setHandle(updated.handle ?? "");
      setSections(updated.sections ?? []);
      setPhotos(updated.photos ?? []);
      setVideos(updated.videos ?? []);
      setState("saved");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Could not save — please try again.");
    }
  }

  const shareUrl = storefrontUrl(handle);
  const urlParts = storefrontUrlParts();

  return (
    <Container className="space-y-8 py-10" size="narrow">
      <header>
        <p className="eyebrow mb-2 text-gold-text">★ Supporter storefront</p>
        <h1 className="text-3xl font-semibold text-ink sm:text-4xl">{initial.title}</h1>
        <p className="mt-2 text-ink-muted">
          Add photos, videos and sections, then share your link.{" "}
          <Link to={`/business/${initial.slug}`} className="text-green-text underline">View public page →</Link>
        </p>
      </header>

      <Panel title="Your shareable link">
        <p className="mb-3 text-sm text-ink-muted">Pick a clean link people can share — letters, numbers and dashes.</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm text-ink-faint">{urlParts.prefix}</span>
          <input value={handle} onChange={(e) => { setHandle(e.target.value); setState("idle"); }} placeholder="neurodynecorp" className={`${field} w-[12rem]`} aria-label="Storefront link handle" />
          {urlParts.suffix && <span className="text-sm text-ink-faint">{urlParts.suffix}</span>}
        </div>
        {shareUrl && (
          <p className="mt-2 break-all text-xs text-ink-muted">
            Shareable: <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="text-green-text underline">{shareUrl}</a>
          </p>
        )}
      </Panel>

      <Panel title="Photos & videos">
        <div className="space-y-6">
          <StorefrontMediaEditor kind="photo" items={photos} max={10} onChange={(next) => { setPhotos(next); setState("idle"); }} />
          <StorefrontMediaEditor kind="video" items={videos} max={5} onChange={(next) => { setVideos(next); setState("idle"); }} />
        </div>
      </Panel>

      <Panel title="Sections">
        <p className="mb-4 text-sm text-ink-muted">Tell your story — an About, a menu or price list, opening hours, a tagline.</p>
        <div className="space-y-4">
          {sections.map((s, i) => (
            <div key={s.id || i} className="rounded-[var(--radius-card)] border border-sand bg-paper p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-green/[0.06] px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-wider text-green-text">{SECTION_KINDS.find((k) => k.type === s.type)?.label ?? s.type}</span>
                <input className={`${field} min-w-[10rem] flex-1`} value={s.title ?? ""} onChange={(e) => patch(i, { title: e.target.value })} placeholder="Section title" />
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => moveSection(i, -1)} disabled={i === 0} aria-label="Move up" className="rounded-md border border-sand px-2 py-1.5 text-sm text-ink-muted hover:border-green/40 disabled:opacity-40">↑</button>
                  <button type="button" onClick={() => moveSection(i, 1)} disabled={i === sections.length - 1} aria-label="Move down" className="rounded-md border border-sand px-2 py-1.5 text-sm text-ink-muted hover:border-green/40 disabled:opacity-40">↓</button>
                  <button type="button" onClick={() => removeSection(i)} aria-label="Remove" className="rounded-md border border-sand px-2 py-1.5 text-sm text-ink-muted hover:border-clay hover:text-clay-text">✕</button>
                </div>
              </div>

              {shapeOf(s.type) === "body" && (
                <textarea rows={4} value={s.body ?? ""} onChange={(e) => patch(i, { body: e.target.value })} placeholder="Write here — Markdown supported." className={`mt-3 resize-none ${field}`} />
              )}
              {shapeOf(s.type) === "quote" && (
                <div className="mt-3 space-y-2">
                  <textarea rows={2} value={s.body ?? ""} onChange={(e) => patch(i, { body: e.target.value })} placeholder="The quote or tagline" className={`resize-none ${field}`} />
                  <input value={s.title ?? ""} onChange={(e) => patch(i, { title: e.target.value })} placeholder="— attribution (optional)" className={field} />
                </div>
              )}
              {shapeOf(s.type) === "items" && (
                <div className="mt-3 space-y-2">
                  {(s.items ?? []).map((it, ii) => (
                    <div key={it.id || ii} className="flex flex-wrap items-center gap-2">
                      <input className={`${field} min-w-[8rem] flex-1`} value={it.label ?? ""} onChange={(e) => patchItem(i, ii, { label: e.target.value })} placeholder={s.type === "schedule" ? "When (e.g. Mon–Fri)" : "Item"} />
                      <input className={`${field} w-32`} value={it.value ?? ""} onChange={(e) => patchItem(i, ii, { value: e.target.value })} placeholder={s.type === "schedule" ? "Time" : "Price"} />
                      <input className={`${field} min-w-[8rem] flex-1`} value={it.detail ?? ""} onChange={(e) => patchItem(i, ii, { detail: e.target.value })} placeholder="Note (optional)" />
                      <button type="button" onClick={() => removeItem(i, ii)} aria-label="Remove row" className="rounded-md border border-sand px-2 py-1.5 text-sm text-ink-muted hover:border-clay hover:text-clay-text">✕</button>
                    </div>
                  ))}
                  <button type="button" onClick={() => addItem(i)} className="rounded-full border border-sand px-3 py-1.5 text-sm font-medium text-ink-muted hover:border-green/40">+ Add row</button>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {SECTION_KINDS.map((k) => (
            <button key={k.type} type="button" onClick={() => addSection(k.type)} className="rounded-full border border-sand px-3.5 py-1.5 text-sm font-medium text-ink-muted hover:border-green/40 hover:text-ink">+ {k.label}</button>
          ))}
        </div>
      </Panel>

      <div className="sticky bottom-4 flex items-center gap-3 rounded-full border border-sand bg-paper/95 p-2 pl-5 shadow-[var(--shadow-lift)] backdrop-blur">
        <span className="text-sm text-ink-muted">
          {state === "saved" ? "Saved ✓" : state === "error" ? (error ?? "Error") : state === "saving" ? "Saving…" : "Unsaved changes"}
        </span>
        <button type="button" onClick={save} disabled={state === "saving"} className="ml-auto rounded-full bg-green px-6 py-2.5 text-sm font-semibold text-on-green transition-colors hover:bg-green-900 disabled:opacity-60">
          {state === "saving" ? "Saving…" : "Save storefront"}
        </button>
      </div>
    </Container>
  );
}

function Panel({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <section className="rounded-[var(--radius-card)] border border-sand bg-cream p-5 shadow-[var(--shadow-card)] sm:p-6">
      <h2 className="mb-4 text-lg font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function Gate({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <Container className="py-16 text-center" size="narrow">
      <h1 className="text-3xl font-semibold text-ink">{title}</h1>
      {children}
    </Container>
  );
}
