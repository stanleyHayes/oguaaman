import { useState } from "react";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router-dom";
import type { InstitutionView, MediaAsset, Office, Organization, ProfileSection, ProfileSectionType, SectionItem, SubEntity } from "@/lib/types";
import { api } from "@/lib/api";
import { Container } from "@/components/ui";
import { ImageUpload } from "@/components/image-upload";
import { DatePicker } from "@/components/date-picker";
import type { Tone } from "@/lib/sections";

interface Data {
  view: InstitutionView;
  manages: boolean;
  slug: string;
}

export async function loader({ params }: LoaderFunctionArgs): Promise<Data> {
  const slug = params.slug!;
  const [view, mine] = await Promise.all([
    api.institution(slug),
    api.myInstitutions().catch(() => [] as Organization[]),
  ]);
  return { view, manages: mine.some((o) => o.slug === slug), slug };
}

export function Component() {
  const { view, manages, slug } = useLoaderData() as Data;
  const org = view.institution;

  if (!manages) {
    return (
      <Container className="py-16 text-center" size="narrow">
        <h1 className="text-3xl font-semibold text-ink">Not your institution to manage</h1>
        <p className="mt-3 text-ink-muted">
          You don’t manage {org.name} yet. Open its page to request management — a steward reviews each claim.
        </p>
        <Link to={`/education/${slug}`} className="mt-6 inline-block rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-cream">
          Back to {org.name}
        </Link>
      </Container>
    );
  }

  return (
    <Container className="space-y-10 py-10" size="narrow">
      <header>
        <p className="eyebrow mb-2">Managing · {org.verified ? "Verified institution" : "Pending verification"}</p>
        <h1 className="text-3xl font-semibold text-ink sm:text-4xl">{org.name}</h1>
        <p className="mt-2 text-ink-muted">
          Keep the official profile current, manage your offices, and post events.{" "}
          <Link to={`/education/${slug}`} className="text-green underline">View public page →</Link>
        </p>
      </header>

      <ProfileForm slug={slug} org={org} />
      <SectionBuilderForm slug={slug} initial={org.sections} />
      <GalleryForm slug={slug} initial={org.gallery} />
      <RosterForm slug={slug} initial={org.offices} />
      <EventForm slug={slug} verified={org.verified} />
    </Container>
  );
}

function Panel({ title, children }: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <section className="rounded-[var(--radius-card)] border border-sand bg-cream p-6">
      <h2 className="mb-4 text-xl font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

const field = "w-full rounded-md border border-sand bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-gold-brand focus:outline-none";
const label = "block text-xs font-semibold uppercase tracking-wide text-ink-faint";

function Saver({ state }: Readonly<{ state: SaveState }>) {
  if (state === "saving") return <span className="text-sm text-ink-faint">Saving…</span>;
  if (state === "saved") return <span className="text-sm text-teal-text">Saved ✓</span>;
  if (state === "error") return <span className="text-sm text-clay-text">Couldn’t save — try again.</span>;
  return null;
}

type SaveState = "idle" | "saving" | "saved" | "error";

function ProfileForm({ slug, org }: Readonly<{ slug: string; org: Organization }>) {
  const [summary, setSummary] = useState(org.summary ?? "");
  const [motto, setMotto] = useState(org.motto ?? "");
  const [history, setHistory] = useState(org.history ?? "");
  const [crestUrl, setCrestUrl] = useState(org.crestUrl ?? "");
  // Per-kind fields
  const [gesCategory, setGesCategory] = useState(org.gesCategory ?? "");
  const [boardingType, setBoardingType] = useState(org.boardingType ?? "");
  const [genderPolicy, setGenderPolicy] = useState(org.genderPolicy ?? "");
  const [nhisAccredited, setNhisAccredited] = useState(org.nhisAccredited ?? false);
  const [ghanaPostGPS, setGhanaPostGPS] = useState(org.ghanaPostGPS ?? "");
  const [momoNumber, setMomoNumber] = useState(org.momoNumber ?? "");
  const [state, setState] = useState<SaveState>("idle");

  const isSchool = org.kind === "school";
  const isHealth = org.kind === "health";

  async function save() {
    setState("saving");
    try {
      await api.updateOrgProfile(slug, {
        summary, motto, history, crestUrl, contact: org.contact ?? [],
        gesCategory, boardingType, genderPolicy,
        nhisAccredited: isHealth ? nhisAccredited : undefined,
        ghanaPostGPS, momoNumber,
      });
      setState("saved");
    } catch {
      setState("error");
    }
  }

  return (
    <Panel title="Profile">
      <div className="space-y-4">
        <ImageUpload
          value={crestUrl}
          onChange={(url) => { setCrestUrl(url); setState("idle"); }}
          label="Crest / logo"
          hint="The institution's official crest or logo — shown on its public page."
        />
        <div>
          <label htmlFor="org-motto" className={label}>Motto</label>
          <input id="org-motto" className={`mt-1.5 ${field}`} value={motto} onChange={(e) => setMotto(e.target.value)} placeholder="e.g. Dwen Hwe Kan" />
        </div>
        <div>
          <label htmlFor="org-summary" className={label}>Summary</label>
          <textarea id="org-summary" rows={3} className={`mt-1.5 resize-none ${field}`} value={summary} onChange={(e) => setSummary(e.target.value)} />
        </div>
        <div>
          <label htmlFor="org-history" className={label}>History</label>
          <textarea id="org-history" rows={4} className={`mt-1.5 resize-none ${field}`} value={history} onChange={(e) => setHistory(e.target.value)} />
        </div>

        {/* Education-specific fields */}
        {isSchool && (
          <>
            <div>
              <label htmlFor="org-ges" className={label}>GES Category</label>
              <select id="org-ges" className={`mt-1.5 ${field}`} value={gesCategory} onChange={(e) => setGesCategory(e.target.value)}>
                <option value="">— select —</option>
                <option value="Primary">Primary (KG–P6)</option>
                <option value="Junior High">Junior High School (JHS)</option>
                <option value="Senior High">Senior High School (SHS)</option>
                <option value="Technical/Vocational">Technical / Vocational</option>
                <option value="Tertiary">Tertiary</option>
              </select>
            </div>
            <div>
              <label htmlFor="org-boarding" className={label}>Boarding arrangement</label>
              <select id="org-boarding" className={`mt-1.5 ${field}`} value={boardingType} onChange={(e) => setBoardingType(e.target.value)}>
                <option value="">— select —</option>
                <option value="day">Day school only</option>
                <option value="boarding">Boarding only</option>
                <option value="both">Both boarding and day</option>
              </select>
            </div>
            <div>
              <label htmlFor="org-gender" className={label}>Admission gender policy</label>
              <select id="org-gender" className={`mt-1.5 ${field}`} value={genderPolicy} onChange={(e) => setGenderPolicy(e.target.value)}>
                <option value="">— select —</option>
                <option value="boys">Boys only</option>
                <option value="girls">Girls only</option>
                <option value="mixed">Mixed / co-educational</option>
              </select>
            </div>
          </>
        )}

        {/* Health-specific fields */}
        {isHealth && (
          <div className="flex items-center gap-3">
            <input id="org-nhis" type="checkbox" checked={nhisAccredited} onChange={(e) => setNhisAccredited(e.target.checked)} className="h-4 w-4 accent-green" />
            <label htmlFor="org-nhis" className="text-sm text-ink">NHIS-accredited facility</label>
          </div>
        )}

        {/* Universal catalog fields */}
        <div>
          <label htmlFor="org-ghanapost" className={label}>GhanaPost GPS address</label>
          <input id="org-ghanapost" className={`mt-1.5 ${field}`} value={ghanaPostGPS} onChange={(e) => setGhanaPostGPS(e.target.value)} placeholder="e.g. CF-0172-0842" />
        </div>
        <div>
          <label htmlFor="org-momo" className={label}>Mobile money / giving number</label>
          <input id="org-momo" className={`mt-1.5 ${field}`} value={momoNumber} onChange={(e) => setMomoNumber(e.target.value)} placeholder="e.g. 024 000 0000" />
          <p className="mt-1 text-xs text-ink-faint">The number supporters can send donations to via MTN MoMo, Telecel Cash, or AirtelTigo.</p>
        </div>

        <div className="flex items-center gap-3">
          <button type="button" onClick={save} disabled={state === "saving"} className="rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-cream hover:bg-green-900 disabled:opacity-60">
            Save profile
          </button>
          <Saver state={state} />
        </div>
      </div>
    </Panel>
  );
}

function RosterForm({ slug, initial }: Readonly<{ slug: string; initial?: Office[] }>) {
  const [offices, setOffices] = useState<Office[]>((initial ?? []).length ? (initial ?? []) : [{ id: "", role: "", holderName: "", verified: false }]);
  const [state, setState] = useState<SaveState>("idle");

  function update(i: number, patch: Partial<Office>) {
    setOffices((cur) => cur.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  }
  function add() {
    setOffices((cur) => [...cur, { id: "", role: "", holderName: "", verified: false }]);
  }
  function remove(i: number) {
    setOffices((cur) => cur.filter((_, idx) => idx !== i));
  }
  async function save() {
    setState("saving");
    try {
      const cleaned = offices.filter((o) => o.role.trim() !== "");
      const updated = await api.setOrgOffices(slug, cleaned);
      setOffices((updated.offices ?? []).length ? (updated.offices ?? []) : [{ id: "", role: "", holderName: "", verified: false }]);
      setState("saved");
    } catch {
      setState("error");
    }
  }

  return (
    <Panel title="Offices &amp; office-holders">
      <div className="space-y-3">
        {offices.map((o, i) => (
          <div key={o.id || i} className="flex flex-wrap items-center gap-2">
            <input
              className={`${field} flex-1 min-w-[8rem]`}
              value={o.role}
              onChange={(e) => update(i, { role: e.target.value })}
              placeholder="Office (e.g. Headmaster)"
            />
            <input
              className={`${field} flex-1 min-w-[8rem]`}
              value={o.holderName ?? ""}
              onChange={(e) => update(i, { holderName: e.target.value })}
              placeholder="Holder’s name"
            />
            <button type="button" onClick={() => remove(i)} aria-label="Remove office" className="rounded-full border border-sand px-3 py-2 text-sm text-ink-muted hover:border-clay hover:text-clay-text">
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={add} className="rounded-full border border-green/30 px-4 py-2 text-sm font-semibold text-green hover:border-green">
          + Add office
        </button>
        <button type="button" onClick={save} disabled={state === "saving"} className="rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-cream hover:bg-green-900 disabled:opacity-60">
          Save roster
        </button>
        <Saver state={state} />
      </div>
    </Panel>
  );
}

function EventForm({ slug, verified }: Readonly<{ slug: string; verified: boolean }>) {
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [venue, setVenue] = useState("");
  const [description, setDescription] = useState("");
  const [state, setState] = useState<SaveState>("idle");
  const [msg, setMsg] = useState("");

  async function post() {
    if (!title.trim()) return;
    setState("saving");
    setMsg("");
    try {
      await api.postOrgEvent(slug, { title: title.trim(), details: { startsAt, venue, description } });
      setState("saved");
      setMsg(verified ? "Published — it’s live on your page." : "Submitted — it’ll appear once a curator approves it.");
      setTitle(""); setStartsAt(""); setVenue(""); setDescription("");
    } catch (e) {
      setState("error");
      setMsg((e as Error).message || "Couldn’t post the event.");
    }
  }

  return (
    <Panel title="Post an official event">
      <div className="space-y-4">
        <div>
          <label htmlFor="org-event-title" className={label}>Title</label>
          <input id="org-event-title" className={`mt-1.5 ${field}`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Speech & Prize-Giving Day" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="org-event-date" className={label}>Date</label>
            <DatePicker id="org-event-date" className="mt-1.5 w-full" value={startsAt} onChange={setStartsAt} />
          </div>
          <div>
            <label htmlFor="org-event-venue" className={label}>Venue</label>
            <input id="org-event-venue" className={`mt-1.5 ${field}`} value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="e.g. Botwe Hall" />
          </div>
        </div>
        <div>
          <label htmlFor="org-event-details" className={label}>Details</label>
          <textarea id="org-event-details" rows={3} className={`mt-1.5 resize-none ${field}`} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={post} disabled={state === "saving" || !title.trim()} className="rounded-full bg-gold-brand px-5 py-2.5 text-sm font-semibold text-green-900 hover:bg-gold disabled:opacity-60">
            {verified ? "Publish event" : "Submit event"}
          </button>
          {msg ? <span className={`text-sm ${state === "error" ? "text-clay-text" : "text-teal-text"}`}>{msg}</span> : <Saver state={state} />}
        </div>
        {!verified && <p className="text-xs text-ink-faint">Your institution isn’t verified yet, so events go through the normal review queue.</p>}
      </div>
    </Panel>
  );
}

// ── custom sections & gallery (the official-page builder) ─────────────────────

// Client-only temp ids give unsaved rows a stable React key (so reorder/remove
// don't misattach per-row state); they are stripped on save so the server mints
// canonical ids (sec-/med-/itm-).
let _tmpSeq = 0;
const nextTmpId = () => `tmp-${++_tmpSeq}`;
const stripTmp = (id?: string) => (id?.startsWith("tmp-") ? "" : id ?? "");

const SECTION_TYPES: { type: ProfileSectionType; label: string; hint: string }[] = [
  { type: "richtext", label: "Text", hint: "A heading + rich text (Markdown, incl. tables)." },
  { type: "gallery", label: "Photo album", hint: "A titled set of photos, e.g. ‘Our library’." },
  { type: "stats", label: "Stats", hint: "Key numbers — founded, students, results." },
  { type: "team", label: "People", hint: "Staff, leaders, or notable alumni." },
  { type: "timeline", label: "Timeline", hint: "Dated milestones." },
  { type: "faq", label: "FAQ", hint: "Questions & answers." },
  { type: "docs", label: "Downloads", hint: "Links to documents — prospectus, forms." },
  { type: "quote", label: "Quote", hint: "A pull-quote; the section title is the attribution." },
  { type: "cta", label: "Call to action", hint: "Heading + text + buttons (apply, donate, visit)." },
  { type: "logos", label: "Partners", hint: "A wall of logos — partners, sponsors, funders." },
  { type: "groups", label: "Sub-entities", hint: "Cards for houses, departments, Asafo companies, year groups, lineage." },
  { type: "hero", label: "Hero banner", hint: "A banner — background image + heading + text + buttons." },
  { type: "testimonials", label: "Testimonials", hint: "Quotes from alumni, parents, or partners." },
  { type: "contact", label: "Contact / hours", hint: "Address + opening hours + phone/email." },
  { type: "menu", label: "Menu / price list", hint: "Items with prices — menu, fees, ticket tiers." },
  { type: "schedule", label: "Schedule", hint: "A timetable — prayer times, fixtures, service times, clinic days." },
  { type: "map", label: "Map / location", hint: "An address with a ‘get directions’ link." },
  { type: "divider", label: "Divider", hint: "A decorative Adinkra divider." },
];
// Section kinds edited through the generic item-list editor.
const ITEM_TYPES = new Set<ProfileSectionType>(["stats", "team", "timeline", "faq", "docs", "logos", "testimonials", "menu", "schedule"]);
const TONE_OPTIONS: Tone[] = ["green", "clay", "gold", "maroon", "teal"];

function sectionTypeLabel(type: string): string {
  return SECTION_TYPES.find((s) => s.type === type)?.label ?? type;
}
function defaultSectionTitle(type: ProfileSectionType): string {
  const titles: Record<ProfileSectionType, string> = {
    richtext: "About", gallery: "Gallery", stats: "By the numbers",
    team: "Our people", timeline: "Milestones", faq: "FAQ", docs: "Downloads",
    quote: "", cta: "Get involved", logos: "Partners", divider: "", groups: "Houses",
    hero: "", testimonials: "What people say", contact: "Visit & contact",
    menu: "Menu", schedule: "Schedule", map: "Find us",
  };
  return titles[type];
}
function newSection(type: ProfileSectionType): ProfileSection {
  return { id: nextTmpId(), type, title: defaultSectionTitle(type), tone: "green", body: "", media: [], items: [], groups: [] };
}

type ItemFieldKey = "label" | "value" | "detail" | "url";
const ITEM_FIELDS: Record<string, { key: ItemFieldKey; placeholder: string; textarea?: boolean }[]> = {
  stats: [
    { key: "label", placeholder: "Label (e.g. Students)" },
    { key: "value", placeholder: "Value (e.g. 1,200)" },
  ],
  team: [
    { key: "value", placeholder: "Name" },
    { key: "label", placeholder: "Role or class" },
    { key: "detail", placeholder: "Short bio", textarea: true },
  ],
  timeline: [
    { key: "label", placeholder: "Date (e.g. 1876)" },
    { key: "value", placeholder: "Heading" },
    { key: "detail", placeholder: "Description", textarea: true },
  ],
  faq: [
    { key: "label", placeholder: "Question" },
    { key: "value", placeholder: "Answer", textarea: true },
  ],
  docs: [
    { key: "label", placeholder: "Title (e.g. Prospectus)" },
    { key: "detail", placeholder: "Note (e.g. PDF)" },
    { key: "url", placeholder: "https://link-to-file" },
  ],
  cta: [
    { key: "label", placeholder: "Button text (e.g. Apply now)" },
    { key: "url", placeholder: "Link (https://…)" },
  ],
  logos: [
    { key: "label", placeholder: "Name" },
    { key: "url", placeholder: "Link (optional)" },
  ],
  testimonials: [
    { key: "value", placeholder: "The quote", textarea: true },
    { key: "label", placeholder: "Author (e.g. Ama Mensah)" },
    { key: "detail", placeholder: "Role (e.g. Old Girl, ’04)" },
  ],
  contact: [
    { key: "label", placeholder: "Label (e.g. Mon–Fri / Phone)" },
    { key: "value", placeholder: "Value (e.g. 8:00–17:00)" },
    { key: "url", placeholder: "Link (optional — tel:/mailto:/https:)" },
  ],
  menu: [
    { key: "label", placeholder: "Item (e.g. Jollof rice)" },
    { key: "value", placeholder: "Price (e.g. ₵25)" },
    { key: "detail", placeholder: "Description (optional)", textarea: true },
  ],
  schedule: [
    { key: "label", placeholder: "When (e.g. Mon–Fri / Fajr / vs Adisadel)" },
    { key: "value", placeholder: "Time / detail (e.g. 8:00–17:00)" },
    { key: "detail", placeholder: "Note (optional)" },
  ],
};

/** Strip the client-side tmp ids from a section tree before saving. */
function sectionForSave(s: ProfileSection): ProfileSection {
  return {
    ...s,
    id: stripTmp(s.id),
    media: s.media?.map((m) => ({ ...m, id: stripTmp(m.id) })),
    items: s.items?.map((it) => ({ ...it, id: stripTmp(it.id) })),
    groups: s.groups?.map((g) => ({
      ...g,
      id: stripTmp(g.id),
      attrs: g.attrs?.map((a) => ({ ...a, id: stripTmp(a.id) })),
    })),
  };
}

function SectionBuilderForm({ slug, initial }: Readonly<{ slug: string; initial?: ProfileSection[] }>) {
  const [sections, setSections] = useState<ProfileSection[]>(initial ?? []);
  const [state, setState] = useState<SaveState>("idle");

  function update(i: number, patch: Partial<ProfileSection>) {
    setSections((cur) => cur.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
    setState("idle");
  }
  function move(i: number, dir: -1 | 1) {
    setSections((cur) => {
      const j = i + dir;
      if (j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setState("idle");
  }
  function remove(i: number) {
    setSections((cur) => cur.filter((_, idx) => idx !== i));
    setState("idle");
  }
  function addType(type: ProfileSectionType) {
    setSections((cur) => [...cur, newSection(type)]);
    setState("idle");
  }
  async function save() {
    setState("saving");
    try {
      const payload = sections.map(sectionForSave);
      const updated = await api.setOrgSections(slug, payload);
      setSections(updated.sections ?? []);
      setState("saved");
    } catch {
      setState("error");
    }
  }

  return (
    <Panel title="Custom sections">
      <p className="mb-4 text-sm text-ink-muted">
        Build your official page — show your facilities, achievements, history, people and more. Add sections below and order them with the arrows.
      </p>
      <div className="space-y-4">
        {sections.map((s, i) => (
          <div key={s.id || i} className="rounded-[var(--radius-card)] border border-sand bg-paper p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-green/[0.06] px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-wider text-green">{sectionTypeLabel(s.type)}</span>
              <input className={`${field} min-w-[10rem] flex-1`} value={s.title ?? ""} onChange={(e) => update(i, { title: e.target.value })} placeholder="Section title" />
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move section up" className="rounded-md border border-sand px-2 py-1.5 text-sm text-ink-muted hover:border-green/40 disabled:opacity-40">↑</button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === sections.length - 1} aria-label="Move section down" className="rounded-md border border-sand px-2 py-1.5 text-sm text-ink-muted hover:border-green/40 disabled:opacity-40">↓</button>
                <button type="button" onClick={() => remove(i)} aria-label="Remove section" className="rounded-md border border-sand px-2 py-1.5 text-sm text-ink-muted hover:border-clay hover:text-clay-text">✕</button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-1.5 text-xs text-ink-muted">
                Accent<select className="rounded-md border border-sand bg-paper px-2 py-1 text-sm text-ink" value={s.tone ?? "green"} onChange={(e) => update(i, { tone: e.target.value })}>
                  {TONE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-1.5 text-xs text-ink-muted">
                <input type="checkbox" checked={!s.hidden} onChange={(e) => update(i, { hidden: !e.target.checked })} />Visible on page
              </label>
            </div>
            <div className="mt-3">
              {s.type === "richtext" && (
                <textarea rows={6} className={`${field} resize-y`} value={s.body ?? ""} onChange={(e) => update(i, { body: e.target.value })} placeholder="Write here. Markdown supported — **bold**, lists, and | tables |." />
              )}
              {s.type === "quote" && (
                <textarea rows={3} className={`${field} resize-y`} value={s.body ?? ""} onChange={(e) => update(i, { body: e.target.value })} placeholder="The quotation. (The section title above is the attribution.)" />
              )}
              {s.type === "cta" && (
                <div className="space-y-3">
                  <textarea rows={2} className={`${field} resize-none`} value={s.body ?? ""} onChange={(e) => update(i, { body: e.target.value })} placeholder="Supporting text (optional)" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Buttons</p>
                  <ItemsEditor type="cta" items={s.items ?? []} onChange={(items) => update(i, { items })} />
                </div>
              )}
              {s.type === "gallery" && (
                <MediaItemsEditor media={s.media ?? []} onChange={(media) => update(i, { media })} />
              )}
              {s.type === "divider" && (
                <p className="text-xs text-ink-faint">A decorative divider — no content needed.</p>
              )}
              {s.type === "groups" && (
                <GroupsEditor groups={s.groups ?? []} onChange={(groups) => update(i, { groups })} />
              )}
              {s.type === "hero" && (
                <div className="space-y-3">
                  <textarea rows={2} className={`${field} resize-none`} value={s.body ?? ""} onChange={(e) => update(i, { body: e.target.value })} placeholder="Subtext under the heading (optional)" />
                  <ImageUpload value={s.media?.[0]?.url ?? ""} onChange={(url) => update(i, { media: url ? [{ id: s.media?.[0]?.id ?? "", url, alt: s.media?.[0]?.alt ?? "" }] : [] })} label="Background image (optional)" hint="A full-width photo behind the heading." />
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Buttons</p>
                  <ItemsEditor type="cta" items={s.items ?? []} onChange={(items) => update(i, { items })} />
                </div>
              )}
              {s.type === "contact" && (
                <div className="space-y-3">
                  <textarea rows={2} className={`${field} resize-none`} value={s.body ?? ""} onChange={(e) => update(i, { body: e.target.value })} placeholder="Address (optional)" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Hours &amp; details</p>
                  <ItemsEditor type="contact" items={s.items ?? []} onChange={(items) => update(i, { items })} />
                </div>
              )}
              {s.type === "map" && (
                <textarea rows={2} className={`${field} resize-none`} value={s.body ?? ""} onChange={(e) => update(i, { body: e.target.value })} placeholder="Address — a ‘Get directions’ link is generated from it." />
              )}
              {ITEM_TYPES.has(s.type) && (
                <ItemsEditor type={s.type} items={s.items ?? []} onChange={(items) => update(i, { items })} />
              )}
            </div>
          </div>
        ))}
        {sections.length === 0 && <p className="text-sm text-ink-faint">No custom sections yet. Add one below.</p>}
      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">Add a section</p>
        <div className="flex flex-wrap gap-2">
          {SECTION_TYPES.map((st) => (
            <button key={st.type} type="button" onClick={() => addType(st.type)} title={st.hint} className="rounded-full border border-sand bg-paper px-3.5 py-1.5 text-sm font-medium text-ink hover:border-green/40">+ {st.label}</button>
          ))}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3 border-t border-dashed border-sand pt-4">
        <button type="button" onClick={save} disabled={state === "saving"} className="rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-cream hover:bg-green-900 disabled:opacity-60">Save sections</button>
        <Saver state={state} />
      </div>
    </Panel>
  );
}

function ItemsEditor({ type, items, onChange }: Readonly<{ type: ProfileSectionType; items: SectionItem[]; onChange: (items: SectionItem[]) => void }>) {
  const fields = ITEM_FIELDS[type] ?? [];
  const showImage = type === "team" || type === "logos" || type === "testimonials";
  function update(i: number, patch: Partial<SectionItem>) {
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function add() { onChange([...items, { id: nextTmpId() }]); }
  function remove(i: number) { onChange(items.filter((_, idx) => idx !== i)); }
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={it.id || i} className="rounded-lg border border-sand bg-cream p-3">
          <div className="space-y-2">
            {fields.map((f) =>
              f.textarea ? (
                <textarea key={f.key} rows={2} className={`${field} resize-none`} value={it[f.key] ?? ""} onChange={(e) => update(i, { [f.key]: e.target.value } as Partial<SectionItem>)} placeholder={f.placeholder} />
              ) : (
                <input key={f.key} className={field} value={it[f.key] ?? ""} onChange={(e) => update(i, { [f.key]: e.target.value } as Partial<SectionItem>)} placeholder={f.placeholder} />
              )
            )}
            {showImage && (
              <ImageUpload value={it.image ?? ""} onChange={(url) => update(i, { image: url })} label="Photo (optional)" hint="A headshot, shown beside the name." />
            )}
          </div>
          <button type="button" onClick={() => remove(i)} className="mt-2 text-sm text-clay-text hover:underline">Remove</button>
        </div>
      ))}
      <button type="button" onClick={add} className="rounded-full border border-green/30 px-4 py-2 text-sm font-semibold text-green hover:border-green">+ Add item</button>
    </div>
  );
}

function MediaItemsEditor({ media, onChange }: Readonly<{ media: MediaAsset[]; onChange: (media: MediaAsset[]) => void }>) {
  function update(i: number, patch: Partial<MediaAsset>) {
    onChange(media.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }
  function add() { onChange([...media, { id: nextTmpId(), url: "" }]); }
  function remove(i: number) { onChange(media.filter((_, idx) => idx !== i)); }
  return (
    <div className="space-y-3">
      {media.map((m, i) => (
        <div key={m.id || i} className="rounded-lg border border-sand bg-cream p-3">
          <ImageUpload value={m.url} onChange={(url) => update(i, { url })} label={`Photo ${i + 1}`} hint="Shown in this album on your public page." />
          <input className={`${field} mt-2`} value={m.caption ?? ""} onChange={(e) => update(i, { caption: e.target.value })} placeholder="Caption (e.g. Aggrey Memorial Library)" />
          <input className={`${field} mt-2`} value={m.alt ?? ""} onChange={(e) => update(i, { alt: e.target.value })} placeholder="Alt text — describe the image for accessibility" />
          <input className={`${field} mt-2`} value={m.credit ?? ""} onChange={(e) => update(i, { credit: e.target.value })} placeholder="Photo credit / source (optional)" />
          <button type="button" onClick={() => remove(i)} className="mt-2 text-sm text-clay-text hover:underline">Remove photo</button>
        </div>
      ))}
      <button type="button" onClick={add} className="rounded-full border border-green/30 px-4 py-2 text-sm font-semibold text-green hover:border-green">+ Add photo</button>
    </div>
  );
}

// Sub-entity cards (houses, departments, Asafo companies, year groups, lineage):
// name + subtitle + colours + crest + summary + key/value facts.
function GroupsEditor({ groups, onChange }: Readonly<{ groups: SubEntity[]; onChange: (groups: SubEntity[]) => void }>) {
  function update(i: number, patch: Partial<SubEntity>) {
    onChange(groups.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));
  }
  function add() { onChange([...groups, { id: nextTmpId(), name: "" }]); }
  function remove(i: number) { onChange(groups.filter((_, idx) => idx !== i)); }
  return (
    <div className="space-y-3">
      {groups.map((g, i) => (
        <div key={g.id || i} className="rounded-lg border border-sand bg-cream p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <input className={field} value={g.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Name (e.g. Pickup)" />
            <input className={field} value={g.subtitle ?? ""} onChange={(e) => update(i, { subtitle: e.target.value })} placeholder="Subtitle (e.g. Boarding house)" />
          </div>
          <input className={`${field} mt-2`} value={(g.colors ?? []).join(", ")} onChange={(e) => update(i, { colors: e.target.value.split(",").map((c) => c.trim()).filter(Boolean) })} placeholder="Colours — comma-separated hex (e.g. #A4161A, #161616)" />
          <textarea rows={2} className={`${field} mt-2 resize-none`} value={g.summary ?? ""} onChange={(e) => update(i, { summary: e.target.value })} placeholder="Short description (optional)" />
          <div className="mt-2">
            <ImageUpload value={g.crestUrl ?? ""} onChange={(url) => update(i, { crestUrl: url })} label="Crest / photo (optional)" hint="Shown on the card." />
          </div>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">Facts</p>
          <AttrsEditor attrs={g.attrs ?? []} onChange={(attrs) => update(i, { attrs })} />
          <button type="button" onClick={() => remove(i)} className="mt-2 text-sm text-clay-text hover:underline">Remove card</button>
        </div>
      ))}
      <button type="button" onClick={add} className="rounded-full border border-green/30 px-4 py-2 text-sm font-semibold text-green hover:border-green">+ Add card</button>
    </div>
  );
}

function AttrsEditor({ attrs, onChange }: Readonly<{ attrs: SectionItem[]; onChange: (attrs: SectionItem[]) => void }>) {
  function update(i: number, patch: Partial<SectionItem>) { onChange(attrs.map((a, idx) => (idx === i ? { ...a, ...patch } : a))); }
  function add() { onChange([...attrs, { id: nextTmpId() }]); }
  function remove(i: number) { onChange(attrs.filter((_, idx) => idx !== i)); }
  return (
    <div className="space-y-2">
      {attrs.map((a, i) => (
        <div key={a.id || i} className="flex flex-wrap items-center gap-2">
          <input className={`${field} min-w-[7rem] flex-1`} value={a.label ?? ""} onChange={(e) => update(i, { label: e.target.value })} placeholder="Label (e.g. Housemaster)" />
          <input className={`${field} min-w-[7rem] flex-1`} value={a.value ?? ""} onChange={(e) => update(i, { value: e.target.value })} placeholder="Value" />
          <button type="button" onClick={() => remove(i)} aria-label="Remove fact" className="rounded-full border border-sand px-3 py-2 text-sm text-ink-muted hover:border-clay hover:text-clay-text">✕</button>
        </div>
      ))}
      <button type="button" onClick={add} className="rounded-full border border-green/30 px-3.5 py-1.5 text-sm font-semibold text-green hover:border-green">+ Add fact</button>
    </div>
  );
}

function GalleryForm({ slug, initial }: Readonly<{ slug: string; initial?: MediaAsset[] }>) {
  const [items, setItems] = useState<MediaAsset[]>(initial ?? []);
  const [state, setState] = useState<SaveState>("idle");

  function update(i: number, patch: Partial<MediaAsset>) {
    setItems((cur) => cur.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
    setState("idle");
  }
  function add() { setItems((cur) => [...cur, { id: nextTmpId(), url: "" }]); setState("idle"); }
  function remove(i: number) { setItems((cur) => cur.filter((_, idx) => idx !== i)); setState("idle"); }
  async function save() {
    setState("saving");
    try {
      const cleaned = items.filter((m) => m.url.trim() !== "").map((m) => ({ ...m, id: stripTmp(m.id) }));
      const updated = await api.setOrgGallery(slug, cleaned);
      setItems(updated.gallery ?? []);
      setState("saved");
    } catch {
      setState("error");
    }
  }

  return (
    <Panel title="Photo gallery">
      <p className="mb-4 text-sm text-ink-muted">Add photos of your institution — campus, events, people. Each can carry a caption and a short description (alt text) for accessibility.</p>
      <div className="space-y-3">
        {items.map((m, i) => (
          <div key={m.id || i} className="rounded-lg border border-sand bg-paper p-3">
            <ImageUpload value={m.url} onChange={(url) => update(i, { url })} label={`Photo ${i + 1}`} hint="Shown in the gallery on your public page." />
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input className={field} value={m.caption ?? ""} onChange={(e) => update(i, { caption: e.target.value })} placeholder="Caption" />
              <input className={field} value={m.alt ?? ""} onChange={(e) => update(i, { alt: e.target.value })} placeholder="Alt text (describe the image)" />
              <input className={`${field} sm:col-span-2`} value={m.credit ?? ""} onChange={(e) => update(i, { credit: e.target.value })} placeholder="Photo credit / source (optional)" />
            </div>
            <button type="button" onClick={() => remove(i)} className="mt-2 text-sm text-clay-text hover:underline">Remove photo</button>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-ink-faint">No photos yet.</p>}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={add} className="rounded-full border border-green/30 px-4 py-2 text-sm font-semibold text-green hover:border-green">+ Add photo</button>
        <button type="button" onClick={save} disabled={state === "saving"} className="rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-cream hover:bg-green-900 disabled:opacity-60">Save gallery</button>
        <Saver state={state} />
      </div>
    </Panel>
  );
}
