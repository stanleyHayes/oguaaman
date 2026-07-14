import { useState } from "react";
import type { ListingType } from "@/lib/types";
import { api } from "@/lib/api";
import { AiWritingBar } from "@/components/ai-writing-bar";
import { DatePicker } from "@/components/date-picker";
import { ImageUpload } from "@/components/image-upload";

const TYPES: { value: ListingType; label: string; hint: string }[] = [
  { value: "artist", label: "Artist", hint: "A musician or act" },
  { value: "business", label: "Business", hint: "A shop, service or trade" },
  { value: "event", label: "Event", hint: "Something happening" },
  { value: "memory", label: "Memory", hint: "A story of old Oguaa" },
  { value: "opportunity", label: "Opportunity", hint: "Scholarship, job, training" },
  { value: "person", label: "Person", hint: "A son or daughter of Oguaa" },
  { value: "memorial", label: "Memorial", hint: "Honour someone who has passed" },
];

// Every listing type carries a cover image — the label and hint are tuned to the
// kind of picture that fits it (a portrait for a person, a flyer for an event…).
const COVER_COPY: Record<ListingType, { label: string; hint: string }> = {
  artist: { label: "Photo (optional)", hint: "A promo shot, performance photo, or portrait of the act." },
  business: { label: "Photo or logo (optional)", hint: "Your storefront, a product, or the business logo." },
  event: { label: "Poster or photo (optional)", hint: "The event flyer, or a photo that represents it." },
  memory: { label: "Old photo (optional)", hint: "A photograph from the time, if you have one to share." },
  opportunity: { label: "Flyer or poster (optional)", hint: "The opportunity's flyer or poster, if there is one." },
  person: { label: "Photo (optional)", hint: "A portrait or a representative photo of them." },
  memorial: { label: "Portrait (optional)", hint: "A dignified portrait of the departed." },
  // Projects aren't in the public picker (campaigns are proposed by verified
  // institutions), but the maps stay total over ListingType.
  project: { label: "Photo (optional)", hint: "The site, the classroom, the thing the project will fix." },
  // Incidents report through the guided Safety form (/safety/report), not the
  // generic submit flow — the maps stay total over ListingType.
  incident: { label: "Photo (optional)", hint: "A photo of the scene, if it is safe to take one." },
  // Lost & found notices post through the guided form (/lost-found/new) — the
  // maps stay total over ListingType.
  lostfound: { label: "Photo (optional)", hint: "A photo of the item or person, if you have one." },
};

// Per-type icon + accent, for the picker cards. Icons inherit currentColor.
const ICONS: Record<ListingType, React.ReactNode> = {
  artist: <><path d="M9 18V5l10-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="16" cy="16" r="3" /></>,
  business: <><path d="M3 9l1.5-5h15L21 9" /><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9" /><path d="M3 9h18M9 20v-6h6v6" /></>,
  event: <><rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9h18M8 2.5v4M16 2.5v4" /></>,
  memory: <><path d="M4 5a2 2 0 0 1 2-2h12a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2Z" /><path d="M8 7h7M8 11h7M8 15h4" /></>,
  opportunity: <path d="M12 3l2.3 4.7 5.2.8-3.7 3.6.9 5.1L12 14.8 7.3 17.3l.9-5.1L4.5 8.5l5.2-.8Z" />,
  person: <><circle cx="12" cy="8" r="3.6" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  memorial: <><path d="M12 3c1.6 1.4 1.6 3.2 0 4.6-1.6-1.4-1.6-3.2 0-4.6Z" /><path d="M12 7.6V13" /><rect x="7" y="13" width="10" height="7" rx="1.5" /></>,
  project: <><path d="M3 21h18" /><path d="M5 21V8l7-5 7 5v13" /><path d="M9 21v-6h6v6" /></>,
  incident: <><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6Z" /><path d="M12 8v4" /><path d="M12 15.5v.5" /></>,
  lostfound: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /><path d="M11 8v3l2 2" /></>,
};
const ACCENT: Record<ListingType, { chip: string; icon: string }> = {
  artist: { chip: "bg-clay/[0.12]", icon: "text-clay-text" },
  business: { chip: "bg-teal/[0.12]", icon: "text-teal-text" },
  event: { chip: "bg-gold/[0.16]", icon: "text-gold-text" },
  memory: { chip: "bg-green/[0.1]", icon: "text-green" },
  opportunity: { chip: "bg-teal/[0.12]", icon: "text-teal-text" },
  person: { chip: "bg-green/[0.1]", icon: "text-green" },
  memorial: { chip: "bg-gold/[0.16]", icon: "text-gold-text" },
  project: { chip: "bg-green/[0.1]", icon: "text-green" },
  incident: { chip: "bg-maroon-900/[0.08]", icon: "text-maroon-900" },
  lostfound: { chip: "bg-teal/[0.12]", icon: "text-teal-text" },
};
function TypeIcon({ type, className = "" }: Readonly<{ type: ListingType; className?: string }>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {ICONS[type]}
    </svg>
  );
}

// The primary free-text field of each type — wired to the AI writing bar and
// kept in controlled state so AI output can populate it.
const AI_FIELD: Record<ListingType, { name: string; label: string; rows: number; placeholder?: string } | null> = {
  artist: { name: "bio", label: "Bio", rows: 4, placeholder: "Tell us about the act…" },
  business: { name: "description", label: "Short description", rows: 3 },
  event: { name: "description", label: "Description", rows: 3 },
  memory: { name: "text", label: "Your memory", rows: 5, placeholder: "Share your Mfantsipim memory, your Fetu Afahye memory…" },
  opportunity: { name: "eligibility", label: "Eligibility", rows: 2 },
  person: { name: "whyNotable", label: "Why notable", rows: 4, placeholder: "Historical or living — why does Oguaa remember them?" },
  memorial: { name: "lifeStory", label: "Life story", rows: 4 },
  project: { name: "description", label: "What the project will do", rows: 4 },
  incident: { name: "description", label: "What happened", rows: 4 },
  lostfound: { name: "description", label: "Description", rows: 4 },
};

const inputCls = "w-full rounded-lg border border-sand bg-paper px-3.5 py-2.5 text-ink placeholder:text-ink-faint focus:border-green focus:outline-none focus:ring-2 focus:ring-green/15";

/** Build the details payload from the form data + the AI-driven text field. */
function collectDetails(fd: FormData, type: ListingType, aiText: string): Record<string, unknown> {
  const details: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k === "title" || k === "coverImageUrl") continue;
    if (typeof v === "string" && v.trim()) details[k] = v.trim();
  }
  // The AI-driven field is a controlled textarea (not a named form input).
  const aiField = AI_FIELD[type];
  if (aiField && aiText.trim()) details[aiField.name] = aiText.trim();
  // Comma-separated text inputs become string arrays.
  for (const listKey of ["genres", "associations"]) {
    if (typeof details[listKey] === "string") {
      details[listKey] = (details[listKey] as string).split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  if (typeof details.bornYear === "string") {
    const n = Number.parseInt(details.bornYear as string, 10);
    if (Number.isFinite(n)) details.bornYear = n; else delete details.bornYear;
  }
  return details;
}

function Field({ label, children, hint }: Readonly<{ label: string; children: React.ReactNode; hint?: string }>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>}
    </label>
  );
}

export function SubmitForm({ initialType }: Readonly<{ initialType?: ListingType }>) {
  const [type, setType] = useState<ListingType>(initialType ?? "artist");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The primary free-text field for the current type, driven by the AI bar.
  const [aiText, setAiText] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");

  function changeType(next: ListingType) {
    setType(next);
    setAiText("");
  }

  if (submitted) return <SubmittedState title={submitted} onReset={() => { setSubmitted(null); setAiText(""); setCoverImageUrl(""); }} />;

  async function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const s = (k: string) => { const v = fd.get(k); return typeof v === "string" ? v : ""; };
    const title = s("title").trim();
    const details = collectDetails(fd, type, aiText);
    if (type === "artist") details.actName = title;
    const cover = coverImageUrl.trim();
    setBusy(true);
    try {
      await api.submit({ type, title, details, coverImageUrl: cover || undefined });
      setSubmitted(title || "Your listing");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const aiField = AI_FIELD[type];
  const cover = COVER_COPY[type];

  return (
    <form onSubmit={onSubmit} className="space-y-7">
      <TypePicker type={type} onChange={changeType} />

      <Field label={type === "memorial" ? "Name of the departed" : "Title / name"}>
        <input name="title" required className={inputCls} placeholder={titlePlaceholder(type)} />
      </Field>

      <ImageUpload value={coverImageUrl} onChange={setCoverImageUrl} label={cover.label} hint={cover.hint} />

      <TypeFields type={type} />

      {aiField && (
        <div>
          <span className="mb-1.5 block text-sm font-medium text-ink">{aiField.label}</span>
          <AiWritingBar
            label={aiField.label}
            showTitle={false}
            rows={aiField.rows}
            value={aiText}
            onChange={setAiText}
          />
        </div>
      )}

      {error && <p className="rounded-lg border border-[#F0D2C9] bg-[#FCEEEA] px-4 py-3 text-sm text-clay-text">{error}</p>}

      <div className="rounded-lg border border-sand bg-cream p-4 text-sm text-ink-muted">
        <span className="font-medium text-ink">One step before you submit:</span> contributing requires a verified phone or WhatsApp number — the platform's spam gate. (Verification ships with member accounts.)
      </div>

      <button type="submit" disabled={busy} className="w-full rounded-full bg-green py-3 text-sm font-semibold text-cream transition-colors hover:bg-green-900 disabled:opacity-60 sm:w-auto sm:px-8">
        {busy ? "Submitting…" : "Submit for review"}
      </button>
    </form>
  );
}

function TypePicker({ type, onChange }: Readonly<{ type: ListingType; onChange: (t: ListingType) => void }>) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-ink">What are you adding?</legend>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {TYPES.map((t) => {
          const on = type === t.value;
          const a = ACCENT[t.value];
          const chipCls = `${a.chip} ${a.icon}`;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => onChange(t.value)}
              aria-pressed={on}
              className={`group relative overflow-hidden rounded-xl border p-3.5 text-left transition-all ${on ? "border-green bg-green/[0.06] shadow-[var(--shadow-card)]" : "border-sand bg-cream hover:-translate-y-0.5 hover:border-green/40 hover:shadow-[var(--shadow-card)]"}`}
            >
              {/* faint oversized watermark decoration */}
              <TypeIcon type={t.value} className={`pointer-events-none absolute -right-3 -top-3 h-16 w-16 opacity-[0.06] ${a.icon}`} />
              <span className={`relative flex h-9 w-9 items-center justify-center rounded-lg ${on ? "bg-green text-cream" : chipCls}`}>
                <TypeIcon type={t.value} className="h-[18px] w-[18px]" />
              </span>
              <span className="relative mt-2.5 block text-sm font-semibold text-ink">{t.label}</span>
              <span className="relative block text-xs leading-snug text-ink-faint">{t.hint}</span>
              {on && (
                <span className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-green text-cream">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 13l4 4L19 7" /></svg>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

// The type-specific extra fields — uncontrolled inputs inside the shared form.
function TypeFields({ type }: Readonly<{ type: ListingType }>) {
  return (
    <>
      {type === "artist" && (<>
        <Field label="Genre(s)" hint="Comma-separated, e.g. Highlife, Gospel"><input name="genres" className={inputCls} placeholder="Highlife, Gospel" /></Field>
        <Field label="Streaming link" hint="We link out, we don't host audio."><input name="link" className={inputCls} placeholder="https://audiomack.com/…" /></Field>
      </>)}
      {type === "business" && (<>
        <Field label="Category / sector"><input name="category" className={inputCls} placeholder="Food & drink, hospitality…" /></Field>
        <Field label="Location / address"><input name="address" className={inputCls} placeholder="Kotokuraba, Cape Coast" /></Field>
      </>)}
      {type === "event" && (<>
        <Field label="Date"><DatePicker name="startsAt" className="w-full" /></Field>
        <Field label="Venue / location"><input name="venue" className={inputCls} placeholder="Victoria Park, Cape Coast" /></Field>
      </>)}
      {type === "memory" && (
        <Field label="Era" hint="e.g. 1980s"><input name="era" className={inputCls} placeholder="1980s" /></Field>
      )}
      {type === "opportunity" && (<>
        <Field label="Type"><select name="kind" className={inputCls}><option value="scholarship">Scholarship</option><option value="internship">Internship</option><option value="apprenticeship">Apprenticeship</option><option value="training">Training</option><option value="job">Job</option></select></Field>
        <Field label="Description"><textarea name="description" rows={2} className={inputCls} /></Field>
        <Field label="How to apply (link)" hint="Information and outbound links only."><input name="applyUrl" className={inputCls} placeholder="https://…" /></Field>
      </>)}
      {type === "person" && (
        <Field label="Era" hint="e.g. Colonial era, 1950s, contemporary"><input name="era" className={inputCls} placeholder="Contemporary" /></Field>
      )}
      {type === "memorial" && (
        <div className="rounded-lg border border-gold-border/40 bg-gold/[0.08] p-4">
          <p className="text-sm text-ink-muted">Memorials are handled with heightened care. Please create one only with the family's awareness. It will be reviewed sensitively and kept permanently.</p>
          <div className="mt-4 space-y-4">
            <Field label="Honorific (optional)" hint="e.g. Nana, Maame, Dr."><input name="honorific" className={inputCls} placeholder="Nana" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Year of birth (optional)"><input name="bornYear" inputMode="numeric" className={inputCls} placeholder="1942" /></Field>
              <Field label="Date of passing (optional)"><DatePicker name="diedDate" className="w-full" /></Field>
            </div>
            <Field label="Birthday (optional)" hint="MM-DD, for yearly remembrance"><input name="birthday" className={inputCls} placeholder="03-21" /></Field>
            <Field label="Epitaph (optional)" hint="A short line of remembrance"><input name="epitaph" className={inputCls} /></Field>
            <Field label="Associations (optional)" hint="Comma-separated — schools, asafo companies, churches…"><input name="associations" className={inputCls} placeholder="Mfantsipim, Bentsir No.1" /></Field>
          </div>
        </div>
      )}
    </>
  );
}

function titlePlaceholder(t: ListingType): string {
  return { artist: "Act / artist name", business: "Business name", event: "Event title", memory: "A title for your memory", opportunity: "Opportunity title", person: "Their name", memorial: "Full name", project: "Project title", incident: "Incident title", lostfound: "Notice title" }[t];
}

function SubmittedState({ title, onReset }: Readonly<{ title: string; onReset: () => void }>) {
  const steps = ["Draft", "Pending", "Approved"];
  return (
    <div className="rounded-[var(--radius-card)] border border-sand bg-cream p-8 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green/[0.08]">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#123F2D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 13l4 4L19 7" /></svg>
      </div>
      <h2 className="mt-4 text-2xl font-semibold text-ink">“{title}” is in the queue</h2>
      <p className="mx-auto mt-3 max-w-md text-sm text-ink-muted">
        A curator will review it for the four things that matter: <b>real · local · correctly categorised · appropriate</b>. You'll be notified the moment it's approved.
      </p>
      <ol className="mx-auto mt-7 flex max-w-sm items-center justify-between">
        {steps.map((s, i) => (
          <li key={s} className="flex flex-1 items-center">
            <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${i <= 1 ? "bg-green text-cream" : "border border-sand text-ink-faint"}`}>{i + 1}</span>
            <span className={`ml-2 text-sm ${i === 1 ? "font-semibold text-green" : "text-ink-faint"}`}>{s}</span>
            {i < steps.length - 1 && <span className="mx-2 h-px flex-1 bg-sand" />}
          </li>
        ))}
      </ol>
      <button type="button" onClick={onReset} className="mt-7 rounded-full border border-green/30 px-6 py-2.5 text-sm font-semibold text-green hover:border-green">Submit another</button>
    </div>
  );
}
