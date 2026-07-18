import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PORTAL } from "@/lib/portal";
import { Card, RoleBadge, VerifiedBadge } from "@/components/ui";
import { ImageUpload } from "@/components/image-upload";
import { BusyLabel } from "@/components/skeleton";
import { CREATOR_TYPES } from "@/lib/creator";
import { formatDate, initials } from "@/lib/format";
import { mediaUrl } from "@/lib/media";
import type { SocialLink } from "@/lib/types";
import {
  CalendarDays,
  ExternalLink,
  Globe2,
  Link2,
  LogOut,
  Palette,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react";

const inputCls =
  "min-h-11 w-full rounded-xl border border-sand bg-paper px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint transition-colors focus:border-green focus:outline-none focus:ring-2 focus:ring-green/15";

type Saved = "idle" | "saving" | "saved" | "error";

export function Component() {
  const { member, setMember, signOut } = useAuth();

  // Profile fields — seeded from the cached member, saved via the API.
  const [photo, setPhoto] = useState(member?.photoUrl ?? "");
  const [photoState, setPhotoState] = useState<Saved>("idle");
  const [name, setName] = useState(member?.displayName ?? "");
  const [bio, setBio] = useState(member?.bio ?? "");
  const [profileState, setProfileState] = useState<Saved>("idle");
  const [profileErr, setProfileErr] = useState<string | null>(null);

  // Social links — an editable list of {label,url} rows.
  const [links, setLinks] = useState<SocialLink[]>(member?.links?.length ? member.links : []);
  const [linksState, setLinksState] = useState<Saved>("idle");
  const [linksErr, setLinksErr] = useState<string | null>(null);

  // Creator types (adds the new "writer" hat).
  const [types, setTypes] = useState<string[]>(member?.creatorTypes ?? []);
  const [typesBusy, setTypesBusy] = useState(false);
  const [typesErr, setTypesErr] = useState<string | null>(null);
  const [typesSaved, setTypesSaved] = useState(false);

  if (!member) return null;

  const profileDirty = name.trim() !== member.displayName || (bio ?? "") !== (member.bio ?? "");
  const linksDirty = JSON.stringify(links) !== JSON.stringify(member.links ?? []);
  const typesDirty = JSON.stringify([...types].sort()) !== JSON.stringify([...(member.creatorTypes ?? [])].sort());

  async function onPhoto(url: string) {
    setPhoto(url);
    setPhotoState("saving");
    try {
      await api.setPhoto(url);
      // Refetch the canonical member; the auth setMember replaces, so spreading
      // the render-captured member here would clobber a concurrent full save.
      const fresh = await api.me();
      setMember(fresh);
      setPhotoState("saved");
    } catch {
      setPhotoState("error");
    }
  }

  async function saveProfile() {
    setProfileState("saving"); setProfileErr(null);
    try {
      const updated = await api.setProfile({ displayName: name.trim(), bio: bio.trim() });
      setMember(updated);
      setName(updated.displayName);
      setBio(updated.bio ?? "");
      setProfileState("saved");
    } catch (e) {
      setProfileErr(e instanceof Error ? e.message : "Could not save your profile.");
      setProfileState("error");
    }
  }

  function setLinkRow(i: number, patch: Partial<SocialLink>) {
    setLinksState("idle");
    setLinks((cur) => cur.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLinkRow() {
    if (links.length >= 20) return;
    setLinksState("idle");
    setLinks((cur) => [...cur, { label: "", url: "" }]);
  }
  function removeLinkRow(i: number) {
    setLinksState("idle");
    setLinks((cur) => cur.filter((_, idx) => idx !== i));
  }
  async function saveLinks() {
    setLinksState("saving"); setLinksErr(null);
    // Drop empty rows before sending; the server sanitises URLs further.
    const clean = links.filter((l) => l.label.trim() && l.url.trim());
    try {
      const res = await api.setLinks(clean);
      setLinks(res.links ?? []);
      // Refetch the canonical member instead of spreading the stale closure,
      // which would clobber a concurrent full-member save on the replace.
      const fresh = await api.me();
      setMember(fresh);
      setLinksState("saved");
    } catch (e) {
      setLinksErr(e instanceof Error ? e.message : "Could not save your links.");
      setLinksState("error");
    }
  }

  function toggleType(id: string) {
    setTypesSaved(false);
    setTypes((cur) => (cur.includes(id) ? cur.filter((t) => t !== id) : [...cur, id]));
  }
  async function saveTypes() {
    setTypesBusy(true); setTypesErr(null); setTypesSaved(false);
    try {
      const updated = await api.setCreatorTypes(types);
      setMember(updated);
      setTypes(updated.creatorTypes ?? []);
      setTypesSaved(true);
    } catch (e) {
      setTypesErr(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setTypesBusy(false);
    }
  }

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-gold-text">Account</p>
          <h1 className="mt-1 text-3xl font-semibold text-ink sm:text-4xl">Profile &amp; creator types</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Your identity in the studio and the kinds of work you publish across the town.
          </p>
        </div>
        <span className="inline-flex min-h-11 items-center gap-2 rounded-full border border-sand bg-cream px-4 text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
          <span className="h-2 w-2 rounded-full bg-teal" aria-hidden />
          Identity desk
        </span>
      </header>

      <section aria-labelledby="identity-preview" className="relative overflow-hidden rounded-[20px] border border-green/40 bg-green-900 text-on-green shadow-[0_26px_70px_-42px_rgba(12,44,31,0.8)]">
        <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-gold/15 blur-3xl" aria-hidden />
        <div className="absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-teal/10 blur-3xl" aria-hidden />
        <div className="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center">
            <div className="relative shrink-0 self-start">
              {photo ? (
                <img src={mediaUrl(photo)} alt="" className="h-24 w-24 rounded-[22px] object-cover ring-1 ring-on-green/25 sm:h-28 sm:w-28" />
              ) : (
                <span className="flex h-24 w-24 items-center justify-center rounded-[22px] bg-gold/20 text-3xl font-bold text-gold ring-1 ring-gold/40 sm:h-28 sm:w-28">
                  {initials(member.displayName)}
                </span>
              )}
              <span className="absolute -bottom-2 -right-2 flex h-9 w-9 items-center justify-center rounded-full border-4 border-green-900 bg-gold text-green-900" aria-hidden>
                <UserRound size={16} strokeWidth={2.4} />
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-gold">Identity preview</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
                <h2 id="identity-preview" className="truncate text-2xl font-semibold !text-on-green sm:text-3xl">{member.displayName}</h2>
                {member.verified && <VerifiedBadge label={member.verifiedAs ? `Verified · ${member.verifiedAs}` : "Verified"} />}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <RoleBadge role={member.role} />
                <span className="inline-flex items-center gap-1.5 text-xs text-on-green/70">
                  <CalendarDays size={13} aria-hidden /> Joined {formatDate(member.joinedAt)}
                </span>
              </div>
              {member.bio && <p className="mt-3 max-w-xl text-sm leading-relaxed text-on-green/75">{member.bio}</p>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:max-w-64 lg:justify-end">
            <a href={`${PORTAL}/members/${member.slug}`} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-gold px-4 text-sm font-semibold text-green-900 transition-colors hover:bg-gold-brand">
              <Globe2 size={16} aria-hidden /> View public profile <ExternalLink size={14} aria-hidden />
            </a>
            <button type="button" onClick={signOut} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-on-green/25 px-4 text-sm font-semibold text-on-green transition-colors hover:border-on-green/50 hover:bg-on-green/10">
              <LogOut size={15} aria-hidden /> Sign out
            </button>
          </div>
        </div>

        <div className="relative grid border-t border-on-green/10 sm:grid-cols-3 sm:divide-x sm:divide-on-green/10">
          <div className="flex items-center justify-between gap-4 border-b border-on-green/10 px-5 py-4 sm:block sm:border-b-0 sm:px-7">
            <span className="text-xs text-on-green/55">Creator focus</span>
            <p className="text-sm font-semibold text-on-green sm:mt-1">{types.length} selected</p>
          </div>
          <div className="flex items-center justify-between gap-4 border-b border-on-green/10 px-5 py-4 sm:block sm:border-b-0 sm:px-7">
            <span className="text-xs text-on-green/55">Profile links</span>
            <p className="text-sm font-semibold text-on-green sm:mt-1">{links.length} connected</p>
          </div>
          <div className="px-5 py-4 sm:px-7">
            <p className="text-xs leading-relaxed text-on-green/65">
              Your public profile lives on the{" "}
              <a href={`${PORTAL}/members/${member.slug}`} className="font-semibold text-gold hover:underline">community portal</a>.
            </p>
          </div>
        </div>
      </section>

      <div className="mt-5 grid items-start gap-5 xl:grid-cols-12">
        <Card className="overflow-hidden xl:col-span-7">
          <div className="flex items-start gap-3 border-b border-sand px-5 py-5 sm:px-6">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-green/[0.09] text-green-text">
              <UserRound size={19} aria-hidden />
            </span>
            <div>
              <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-ink-faint">01 · Public profile</p>
              <h2 className="mt-1 text-xl font-semibold text-ink">Shape your introduction</h2>
            </div>
          </div>

          <div className="grid items-start gap-6 p-5 sm:p-6 md:grid-cols-[minmax(13rem,0.72fr)_minmax(0,1.28fr)]">
            <div className="rounded-2xl border border-sand bg-paper/70 p-4">
              <ImageUpload value={photo} onChange={onPhoto} label="Profile photo" hint="Square works best — JPG, PNG or WebP, up to 8 MB." />
              {photoState === "saving" && <BusyLabel label="Saving profile photo" width="w-20" className="mt-3" />}
              {photoState === "saved" && <p className="mt-3 text-xs font-medium text-teal-text" role="status">Photo saved ✓</p>}
              {photoState === "error" && <p className="mt-3 text-xs text-clay-text" role="alert">Couldn't save the photo — try again.</p>}
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Display name</span>
                <input value={name} onChange={(e) => { setName(e.target.value); setProfileState("idle"); }} className={inputCls} placeholder="Your name" />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Bio</span>
                <textarea value={bio} onChange={(e) => { setBio(e.target.value); setProfileState("idle"); }} rows={6}
                  className={`${inputCls} resize-y leading-relaxed`} placeholder="A sentence or two about you and your work." />
              </label>

              {profileErr && <p className="rounded-xl border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay-text" role="alert">{profileErr}</p>}
              <div className="flex flex-wrap items-center gap-3 border-t border-sand pt-4">
                <button type="button" onClick={saveProfile} disabled={profileState === "saving" || !profileDirty} aria-busy={profileState === "saving" || undefined}
                  className="inline-flex min-h-11 items-center rounded-full bg-green px-5 text-sm font-semibold text-on-green transition-colors hover:bg-green-900 disabled:opacity-50">
                  {profileState === "saving" ? <BusyLabel label="Saving profile" width="w-20" /> : "Save profile"}
                </button>
                {profileState === "saved" && !profileDirty && <span className="text-sm font-medium text-teal-text" role="status">Saved ✓</span>}
              </div>
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden xl:col-span-5">
          <div className="flex items-start gap-3 border-b border-sand px-5 py-5 sm:px-6">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gold/[0.16] text-gold-text">
              <Palette size={19} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-ink-faint">02 · Creative practice</p>
                <span className="rounded-full bg-gold/[0.13] px-2.5 py-1 text-xs font-semibold text-gold-text">{types.length} selected</span>
              </div>
              <h2 className="mt-1 text-xl font-semibold text-ink">What do you create?</h2>
              <p className="mt-1 text-sm text-ink-muted">
                Pick every hat you wear. This tunes the studio and tells the town what to expect from you.
              </p>
            </div>
          </div>

          <div className="p-5 sm:p-6">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              {CREATOR_TYPES.map((ct) => {
                const on = types.includes(ct.id);
                return (
                  <button key={ct.id} type="button" onClick={() => toggleType(ct.id)} aria-pressed={on}
                    className={`group relative min-h-24 overflow-hidden rounded-2xl border p-3.5 text-left transition-all ${
                      on ? "border-gold-border bg-gold/[0.11]" : "border-sand bg-paper/40 hover:border-gold-border/50"
                    }`}>
                    <span className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${on ? "bg-gold text-green-900" : "bg-sand/70 text-ink-faint group-hover:text-gold-text"}`}>
                      <ct.icon size={17} aria-hidden />
                    </span>
                    <span className="block pr-6 text-sm font-semibold text-ink">{ct.label}</span>
                    <span className="mt-0.5 block text-xs leading-snug text-ink-faint">{ct.desc}</span>
                    <span className={`absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold ${
                      on ? "border-gold-brand bg-gold-brand text-green-900" : "border-sand text-transparent"
                    }`} aria-hidden>✓</span>
                  </button>
                );
              })}
            </div>
            {typesErr && <p className="mt-3 rounded-xl border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay-text" role="alert">{typesErr}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-sand pt-4">
              <button type="button" onClick={saveTypes} disabled={typesBusy || !typesDirty} aria-busy={typesBusy || undefined}
                className="inline-flex min-h-11 items-center rounded-full bg-green px-5 text-sm font-semibold text-on-green transition-colors hover:bg-green-900 disabled:opacity-50">
                {typesBusy ? <BusyLabel label="Saving creator types" width="w-24" /> : "Save creator types"}
              </button>
              {typesSaved && !typesDirty && <span className="text-sm font-medium text-teal-text" role="status">Saved ✓</span>}
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden xl:col-span-12">
          <div className="grid xl:grid-cols-[19rem_minmax(0,1fr)]">
            <div className="border-b border-sand bg-gradient-to-br from-green/[0.08] via-cream to-gold/[0.08] p-5 sm:p-6 xl:border-b-0 xl:border-r">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-green text-on-green">
                <Link2 size={19} aria-hidden />
              </span>
              <p className="mt-5 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-ink-faint">03 · Link shelf</p>
              <h2 className="mt-1 text-xl font-semibold text-ink">Your links</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">Socials and sites shown on your public profile.</p>
              <div className="mt-5 flex items-center justify-between rounded-xl border border-sand bg-cream/80 px-3.5 py-3 text-sm">
                <span className="text-ink-muted">Connected</span>
                <span className="font-semibold text-ink">{links.length} / 20</span>
              </div>
              {links.length < 20 && (
                <button type="button" onClick={addLinkRow}
                  className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full border border-green/25 bg-cream px-4 text-sm font-semibold text-green-text transition-colors hover:border-green/50 hover:bg-green/[0.05]">
                  <Plus size={15} aria-hidden /> Add a link
                </button>
              )}
            </div>

            <div className="p-5 sm:p-6">
              {links.length === 0 ? (
                <div className="flex min-h-28 items-center justify-center rounded-2xl border border-dashed border-sand bg-paper/40 px-4 text-center">
                  <p className="text-sm text-ink-faint">No links yet. Add your first below.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {links.map((l, i) => (
                    <div key={i} className="grid gap-2 rounded-2xl border border-sand bg-paper/40 p-2.5 sm:grid-cols-[9rem_minmax(0,1fr)_2.75rem] sm:items-center">
                      <input value={l.label} onChange={(e) => setLinkRow(i, { label: e.target.value })} placeholder="Instagram"
                        className={inputCls} aria-label={`Link ${i + 1} label`} />
                      <input value={l.url} onChange={(e) => setLinkRow(i, { url: e.target.value })} placeholder="https://…"
                        className={inputCls} aria-label={`Link ${i + 1} URL`} type="url" />
                      <button type="button" onClick={() => removeLinkRow(i)} aria-label={`Remove link ${i + 1}`}
                        className="flex h-11 w-11 items-center justify-center justify-self-end rounded-xl text-ink-faint transition-colors hover:bg-maroon-900/[0.07] hover:text-maroon-text">
                        <Trash2 size={16} aria-hidden />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {linksErr && <p className="mt-3 rounded-xl border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay-text" role="alert">{linksErr}</p>}
              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-sand pt-4">
                <button type="button" onClick={saveLinks} disabled={linksState === "saving" || !linksDirty} aria-busy={linksState === "saving" || undefined}
                  className="inline-flex min-h-11 items-center rounded-full bg-green px-5 text-sm font-semibold text-on-green transition-colors hover:bg-green-900 disabled:opacity-50">
                  {linksState === "saving" ? <BusyLabel label="Saving profile links" width="w-20" /> : "Save links"}
                </button>
                {linksState === "saved" && !linksDirty && <span className="text-sm font-medium text-teal-text" role="status">Saved ✓</span>}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
