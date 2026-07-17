import { useState, type ReactNode, type FormEvent } from "react";
import { Link, useLoaderData, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import type { Listing } from "@/lib/types";
import { BackLink, Card, StatusBadge } from "@/components/ui";
import { ImageUpload } from "@/components/image-upload";
import { DatePicker } from "@/components/date-picker";

interface Data {
  listing: Listing | null;
}

// The member view carries every owned listing (all statuses) — no dedicated
// read endpoint needed; ownership is proven by it being in the member's list.
export async function loader({ params }: { params: { id?: string } }): Promise<Data> {
  const me = await api.me();
  const view = await api.member(me.slug);
  return { listing: view.listings.find((l) => l.id === params.id) ?? null };
}

const TYPE_LABELS: Record<string, string> = {
  business: "Business", artist: "Artist", person: "Person", memory: "Memory",
  event: "Event", opportunity: "Opportunity", memorial: "Memorial",
};

const COVER_COPY: Record<string, { label: string; hint: string }> = {
  artist: { label: "Photo", hint: "A promo shot, performance photo, or portrait of the act." },
  business: { label: "Photo or logo", hint: "Your storefront, a product, or the business logo." },
  event: { label: "Poster or photo", hint: "The event flyer, or a photo that represents it." },
  memory: { label: "Old photo", hint: "A photograph from the time, if you have one to share." },
  opportunity: { label: "Flyer or poster", hint: "The opportunity's flyer or poster, if there is one." },
  person: { label: "Photo", hint: "A portrait or a representative photo of them." },
  memorial: { label: "Portrait", hint: "A dignified portrait of the departed." },
};

// The primary free-text field of each type (plain textarea here — the AI
// writing bar stays on the portal's submit form).
const TEXT_FIELD: Record<string, { name: string; label: string; rows: number }> = {
  artist: { name: "bio", label: "Bio", rows: 4 },
  business: { name: "description", label: "Short description", rows: 3 },
  event: { name: "description", label: "Description", rows: 3 },
  memory: { name: "text", label: "Your memory", rows: 5 },
  opportunity: { name: "eligibility", label: "Eligibility", rows: 2 },
  person: { name: "whyNotable", label: "Why notable", rows: 4 },
  memorial: { name: "lifeStory", label: "Life story", rows: 4 },
};

// Detail keys the form manages per type. Whitelisted keys NOT listed here are
// passed through untouched from the stored listing (streamingLinks, services,
// gallery…), so a full-replace edit never erases richer data.
const MANAGED_KEYS: Record<string, string[]> = {
  artist: ["genres", "link", "bio", "actName"],
  business: ["category", "address", "description"],
  event: ["startsAt", "venue", "description"],
  memory: ["era", "text"],
  opportunity: ["kind", "description", "applyUrl", "eligibility", "provider", "safeguardingPolicyUrl", "minAge", "maxAge", "guardianConsentRequired"],
  person: ["era", "whyNotable"],
  memorial: ["honorific", "bornYear", "diedDate", "birthday", "epitaph", "associations", "lifeStory", "observeBirthday", "remindersEnabled"],
};

// The server's per-type whitelist (mirror of editableDetailsKeys in Go) — used
// to compute the passthrough set.
const WHITELIST: Record<string, string[]> = {
  artist: ["actName", "genres", "bio", "link", "streamingLinks", "socials", "booking"],
  business: ["category", "description", "address", "openingHours", "services", "contact"],
  event: ["description", "startsAt", "venue", "organiser"],
  memory: ["text", "era"],
  opportunity: ["kind", "description", "eligibility", "deadline", "applyUrl", "provider", "safeguardingPolicyUrl", "minAge", "maxAge", "guardianConsentRequired"],
  person: ["whyNotable", "era"],
  memorial: ["honorific", "bornYear", "diedDate", "birthday", "epitaph", "lifeStory", "associations", "gallery", "observeBirthday", "remindersEnabled"],
};

const inputCls =
  "w-full rounded-lg border border-sand bg-paper px-3.5 py-2.5 text-ink placeholder:text-ink-faint focus:border-green focus:outline-none focus:ring-2 focus:ring-green/15";

function Field({ label, children, hint }: Readonly<{ label: string; children: ReactNode; hint?: string }>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>}
    </label>
  );
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function strList(v: unknown): string {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").join(", ") : "";
}

export function Component() {
  const { listing } = useLoaderData() as Data;
  const { id } = useParams();

  if (!listing || !WHITELIST[listing.type]) {
    return (
      <div>
        <BackLink to="/work">My work</BackLink>
        <Card className="p-8 text-center">
          <h1 className="text-2xl font-semibold text-ink">Not your listing to edit</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
            {listing
              ? "Incidents, lost & found notices and institution projects are edited through their own flows."
              : "This listing doesn't exist or belongs to someone else. Only the owner can edit a listing."}
          </p>
          <Link to="/work" className="mt-5 inline-block rounded-full bg-green px-5 py-2 text-sm font-semibold text-on-green">Back to My Work</Link>
        </Card>
      </div>
    );
  }
  return <EditForm key={id} listing={listing} />;
}

function EditForm({ listing }: Readonly<{ listing: Listing }>) {
  const type = listing.type;
  const textField = TEXT_FIELD[type];
  const cover = COVER_COPY[type];
  const [coverImageUrl, setCoverImageUrl] = useState(listing.coverImageUrl ?? "");
  const [text, setText] = useState(textField ? str(listing.details[textField.name]) : "");
  // DatePicker is controlled; only the type-relevant one is rendered.
  const [startsAt, setStartsAt] = useState(str(listing.details.startsAt));
  const [diedDate, setDiedDate] = useState(str(listing.details.diedDate));
  // Memorial keeper controls (spec §8.11): reminders default on; the birthday
  // is observed only by the keeper's choice. Absent keys read as those defaults.
  const [reminders, setReminders] = useState(listing.details.remindersEnabled !== false);
  const [observeBday, setObserveBday] = useState(listing.details.observeBirthday === true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<"live" | "queued" | null>(null);

  const resubmits = listing.status !== "approved" && listing.status !== "pending";

  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const title = str(fd.get("title")).trim();
    const details: Record<string, unknown> = {};
    for (const [k, v] of fd.entries()) {
      if (k === "title") continue;
      if (typeof v === "string" && v.trim()) details[k] = v.trim();
    }
    if (textField && text.trim()) details[textField.name] = text.trim();
    for (const listKey of ["genres", "associations"]) {
      if (typeof details[listKey] === "string") {
        details[listKey] = (details[listKey] as string).split(",").map((s) => s.trim()).filter(Boolean);
      }
    }
    if (typeof details.bornYear === "string") {
      const n = Number.parseInt(details.bornYear as string, 10);
      if (Number.isFinite(n)) details.bornYear = n; else delete details.bornYear;
    }
    if (type === "artist") details.actName = title;
    if (type === "memorial") {
      details.remindersEnabled = reminders;
      details.observeBirthday = observeBday;
    }

    // Passthrough: whitelisted keys the form doesn't manage survive untouched.
    const managed = new Set(MANAGED_KEYS[type] ?? []);
    for (const k of WHITELIST[type] ?? []) {
      if (!managed.has(k) && listing.details[k] !== undefined && details[k] === undefined) {
        details[k] = listing.details[k];
      }
    }

    setBusy(true);
    try {
      const updated = await api.updateListing(listing.id, { title, coverImageUrl: coverImageUrl.trim() || undefined, details });
      setSaved(updated.status === "approved" ? "live" : "queued");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not save. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <div>
        <BackLink to="/work">My work</BackLink>
        <Card className="p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-teal/[0.12]">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-teal-text" aria-hidden><path d="M5 13l4 4L19 7" /></svg>
          </div>
          <h1 className="mt-4 text-2xl font-semibold text-ink">
            {saved === "live" ? "Changes saved — still live" : "Changes saved — back in the queue"}
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
            {saved === "live"
              ? "Your updates are on the public page already. A curator can spot-check the change in the audit trail."
              : "A curator will review your changes before the listing goes live again. You'll be notified."}
          </p>
          <Link to="/work" className="mt-6 inline-block rounded-full bg-green px-6 py-2.5 text-sm font-semibold text-on-green">Back to My Work</Link>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <BackLink to="/work">My work</BackLink>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div>
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-gold-text">Edit {TYPE_LABELS[type] ?? type}</p>
          <h1 className="mt-1 text-3xl font-semibold text-ink">{listing.title}</h1>
        </div>
        <StatusBadge status={listing.status} />
      </div>

      {resubmits && (
        <p className="mb-4 rounded-lg bg-gold/[0.12] px-4 py-3 text-sm font-medium text-gold-text">
          Saving sends this listing back to the review queue — a curator re-approves it before it's live again.
        </p>
      )}
      {listing.status === "approved" && (
        <p className="mb-4 rounded-lg bg-teal/[0.1] px-4 py-3 text-sm text-teal-text">
          This listing is live. Your changes publish immediately; curators can spot-check them in the audit trail.
        </p>
      )}

      <Card className="p-5 sm:p-6">
        <form onSubmit={onSubmit} className="space-y-6">
          <Field label={type === "memorial" ? "Name of the departed" : "Title / name"}>
            <input name="title" required defaultValue={listing.title} className={inputCls} />
          </Field>

          <ImageUpload value={coverImageUrl} onChange={setCoverImageUrl} label={cover?.label ?? "Cover image"} hint={cover?.hint} />

          {type === "artist" && (<>
            <Field label="Genre(s)" hint="Comma-separated, e.g. Highlife, Gospel"><input name="genres" defaultValue={strList(listing.details.genres)} className={inputCls} /></Field>
            <Field label="Streaming link" hint="We link out, we don't host audio."><input name="link" defaultValue={str(listing.details.link)} className={inputCls} /></Field>
          </>)}
          {type === "business" && (<>
            <Field label="Category / sector"><input name="category" defaultValue={str(listing.details.category)} className={inputCls} /></Field>
            <Field label="Location / address"><input name="address" defaultValue={str(listing.details.address)} className={inputCls} /></Field>
          </>)}
          {type === "event" && (<>
            <Field label="Date"><DatePicker name="startsAt" value={startsAt} onChange={setStartsAt} className="w-full" /></Field>
            <Field label="Venue / location"><input name="venue" defaultValue={str(listing.details.venue)} className={inputCls} /></Field>
          </>)}
          {type === "memory" && (
            <Field label="Era" hint="e.g. 1980s"><input name="era" defaultValue={str(listing.details.era)} className={inputCls} /></Field>
          )}
          {type === "opportunity" && (<>
            <Field label="Type"><select name="kind" defaultValue={str(listing.details.kind) || "scholarship"} className={inputCls}><option value="scholarship">Scholarship</option><option value="internship">Internship</option><option value="apprenticeship">Apprenticeship</option><option value="training">Training</option><option value="job">Job</option><option value="investment">Investment</option><option value="mentorship">Mentorship programme</option></select></Field>
            <Field label="Description"><textarea name="description" rows={2} defaultValue={str(listing.details.description)} className={inputCls} /></Field>
            <Field label="Provider / programme owner"><input name="provider" defaultValue={str(listing.details.provider)} className={inputCls} /></Field>
            <Field label="Safeguarding / policy link (required for mentorship)"><input name="safeguardingPolicyUrl" defaultValue={str(listing.details.safeguardingPolicyUrl)} className={inputCls} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Minimum age (optional)"><input name="minAge" inputMode="numeric" defaultValue={str(listing.details.minAge)} className={inputCls} /></Field>
              <Field label="Maximum age (optional)"><input name="maxAge" inputMode="numeric" defaultValue={str(listing.details.maxAge)} className={inputCls} /></Field>
            </div>
            <label className="flex items-start gap-2.5 rounded-lg border border-sand bg-paper p-3.5 text-sm text-ink">
              <input type="checkbox" name="guardianConsentRequired" defaultChecked={listing.details.guardianConsentRequired !== false} className="mt-0.5 accent-green" />
              <span>Require guardian consent for minors<span className="block text-xs text-ink-faint">Mandatory when mentorship includes under-18s.</span></span>
            </label>
            <Field label="How to apply (link)" hint="Information and outbound links only."><input name="applyUrl" defaultValue={str(listing.details.applyUrl)} className={inputCls} /></Field>
          </>)}
          {type === "person" && (
            <Field label="Era" hint="e.g. Colonial era, 1950s, contemporary"><input name="era" defaultValue={str(listing.details.era)} className={inputCls} /></Field>
          )}
          {type === "memorial" && (
            <div className="rounded-lg border border-gold-border/40 bg-gold/[0.08] p-4">
              <div className="space-y-4">
                <Field label="Honorific (optional)" hint="e.g. Nana, Maame, Dr."><input name="honorific" defaultValue={str(listing.details.honorific)} className={inputCls} /></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Year of birth (optional)"><input name="bornYear" inputMode="numeric" defaultValue={typeof listing.details.bornYear === "number" ? String(listing.details.bornYear) : ""} className={inputCls} /></Field>
                  <Field label="Date of passing (optional)"><DatePicker name="diedDate" value={diedDate} onChange={setDiedDate} max={todayIso} className="w-full" /></Field>
                </div>
                <Field label="Birthday (optional)" hint="MM-DD, for yearly remembrance"><input name="birthday" defaultValue={str(listing.details.birthday)} className={inputCls} /></Field>
                <Field label="Epitaph (optional)" hint="A short line of remembrance"><input name="epitaph" defaultValue={str(listing.details.epitaph)} className={inputCls} /></Field>
                <Field label="Associations (optional)" hint="Comma-separated — schools, asafo companies, churches…"><input name="associations" defaultValue={strList(listing.details.associations)} className={inputCls} /></Field>
                <div className="space-y-3 rounded-lg border border-sand bg-paper p-3.5">
                  <label className="flex items-start gap-2.5 text-sm text-ink">
                    <input type="checkbox" checked={reminders} onChange={(e) => setReminders(e.target.checked)} className="mt-0.5 accent-green" />
                    <span>Yearly remembrance<span className="block text-xs text-ink-faint">A gentle reminder reaches those who remember them, each year on the passing anniversary.</span></span>
                  </label>
                  <label className="flex items-start gap-2.5 text-sm text-ink">
                    <input type="checkbox" checked={observeBday} onChange={(e) => setObserveBday(e.target.checked)} className="mt-0.5 accent-green" />
                    <span>Also observe the birthday<span className="block text-xs text-ink-faint">Remember them on their birthday too, not only the anniversary of their passing.</span></span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {textField && (
            <Field label={textField.label}>
              <textarea rows={textField.rows} value={text} onChange={(e) => setText(e.target.value)} className={inputCls} />
            </Field>
          )}

          {err && <p className="rounded-lg border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay-text">{err}</p>}

          <div className="flex items-center gap-3">
            <button type="submit" disabled={busy} className="rounded-full bg-green px-8 py-3 text-sm font-semibold text-on-green transition-colors hover:bg-green-900 disabled:opacity-60">
              {busy ? "Saving…" : resubmits ? "Save & resubmit" : "Save changes"}
            </button>
            <Link to="/work" className="text-sm font-medium text-ink-faint hover:text-ink">Cancel</Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
