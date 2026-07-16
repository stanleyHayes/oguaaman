import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PORTAL } from "@/lib/portal";
import { Card, RoleBadge, VerifiedBadge } from "@/components/ui";
import { ImageUpload } from "@/components/image-upload";
import { CREATOR_TYPES } from "@/lib/creator";
import { formatDate, initials } from "@/lib/format";
import type { SocialLink } from "@/lib/types";
import { LogOut, Plus, Trash2, Link2 } from "lucide-react";

const inputCls =
  "w-full rounded-lg border border-sand bg-paper px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-green focus:outline-none focus:ring-2 focus:ring-green/15";

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
      <div className="mb-6">
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-gold-text">Account</p>
        <h1 className="mt-1 text-3xl font-semibold text-ink">Profile &amp; creator types</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Your identity in the studio and the kinds of work you publish across the town.
        </p>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {/* Identity + profile editor */}
        <Card className="overflow-hidden">
          <div className="h-20 bg-gradient-to-br from-green/[0.12] via-cream to-gold/[0.1]" aria-hidden />
          <div className="px-5 pb-5">
            <div className="-mt-10">
              {photo ? (
                <img src={photo} alt="" className="h-20 w-20 rounded-full object-cover ring-4 ring-cream" />
              ) : (
                <span className="flex h-20 w-20 items-center justify-center rounded-full bg-gold/15 text-2xl font-bold text-gold-text ring-4 ring-cream">{initials(member.displayName)}</span>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <p className="truncate text-xl font-semibold text-ink">{member.displayName}</p>
              {member.verified && <VerifiedBadge label={member.verifiedAs ? `Verified · ${member.verifiedAs}` : "Verified"} />}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <RoleBadge role={member.role} />
              <span className="text-xs text-ink-faint">Joined {formatDate(member.joinedAt)}</span>
            </div>

            <div className="mt-5 space-y-4 border-t border-sand pt-5">
              <ImageUpload value={photo} onChange={onPhoto} label="Profile photo" hint="Square works best — JPG, PNG or WebP, up to 8 MB." />
              {photoState === "saving" && <p className="-mt-2 text-xs text-ink-faint">Saving photo…</p>}
              {photoState === "saved" && <p className="-mt-2 text-xs font-medium text-teal-text">Photo saved ✓</p>}
              {photoState === "error" && <p className="-mt-2 text-xs text-clay-text">Couldn't save the photo — try again.</p>}

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Display name</span>
                <input value={name} onChange={(e) => { setName(e.target.value); setProfileState("idle"); }} className={inputCls} placeholder="Your name" />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Bio</span>
                <textarea value={bio} onChange={(e) => { setBio(e.target.value); setProfileState("idle"); }} rows={4}
                  className={`${inputCls} resize-y`} placeholder="A sentence or two about you and your work." />
              </label>

              {profileErr && <p className="rounded-lg border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay-text">{profileErr}</p>}
              <div className="flex items-center gap-3">
                <button onClick={saveProfile} disabled={profileState === "saving" || !profileDirty}
                  className="rounded-full bg-green px-5 py-2 text-sm font-semibold text-on-green transition-colors hover:bg-green-900 disabled:opacity-50">
                  {profileState === "saving" ? "Saving…" : "Save profile"}
                </button>
                {profileState === "saved" && !profileDirty && <span className="text-sm font-medium text-teal-text">Saved ✓</span>}
              </div>
            </div>

            <p className="mt-5 text-sm text-ink-muted">
              Your public profile lives on the{" "}
              <a href={`${PORTAL}/me`} className="font-semibold text-gold-text hover:underline">community portal</a>.
            </p>

            <div className="mt-5 border-t border-sand pt-4">
              <button onClick={signOut} className="inline-flex items-center gap-2 rounded-full border border-maroon-text/40 px-4 py-2 text-sm font-semibold text-maroon-text transition-colors hover:bg-maroon-900/[0.06]">
                <LogOut size={15} aria-hidden /> Sign out
              </button>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          {/* Creator types */}
          <Card className="overflow-hidden">
            <div className="border-b border-sand px-5 py-4">
              <h2 className="text-lg font-semibold text-ink">What do you create?</h2>
              <p className="mt-0.5 text-sm text-ink-muted">
                Pick every hat you wear. This tunes the studio and tells the town what to expect from you.
              </p>
            </div>
            <div className="p-5">
              <div className="space-y-2">
                {CREATOR_TYPES.map((ct) => {
                  const on = types.includes(ct.id);
                  return (
                    <button key={ct.id} type="button" onClick={() => toggleType(ct.id)} aria-pressed={on}
                      className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                        on ? "border-gold-border bg-gold/[0.1]" : "border-sand hover:border-gold-border/50"
                      }`}>
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${on ? "bg-gold/20 text-gold-text" : "bg-sand/60 text-ink-faint"}`}>
                        <ct.icon size={17} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-ink">{ct.label}</span>
                        <span className="block text-xs text-ink-faint">{ct.desc}</span>
                      </span>
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                        on ? "border-gold-brand bg-gold-brand text-green-900" : "border-sand text-transparent"
                      }`} aria-hidden>✓</span>
                    </button>
                  );
                })}
              </div>
              {typesErr && <p className="mt-3 rounded-lg border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay-text">{typesErr}</p>}
              <div className="mt-4 flex items-center gap-3">
                <button onClick={saveTypes} disabled={typesBusy || !typesDirty}
                  className="rounded-full bg-green px-5 py-2 text-sm font-semibold text-on-green transition-colors hover:bg-green-900 disabled:opacity-50">
                  {typesBusy ? "Saving…" : "Save creator types"}
                </button>
                {typesSaved && !typesDirty && <span className="text-sm font-medium text-teal-text">Saved ✓</span>}
              </div>
            </div>
          </Card>

          {/* Social links */}
          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-sand px-5 py-4">
              <Link2 size={17} className="text-ink-muted" aria-hidden />
              <div>
                <h2 className="text-lg font-semibold text-ink">Your links</h2>
                <p className="mt-0.5 text-sm text-ink-muted">Socials and sites shown on your public profile.</p>
              </div>
            </div>
            <div className="p-5">
              {links.length === 0 ? (
                <p className="text-sm text-ink-faint">No links yet. Add your first below.</p>
              ) : (
                <div className="space-y-2.5">
                  {links.map((l, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <input value={l.label} onChange={(e) => setLinkRow(i, { label: e.target.value })} placeholder="Instagram"
                        className={`${inputCls} sm:w-40`} aria-label={`Link ${i + 1} label`} />
                      <input value={l.url} onChange={(e) => setLinkRow(i, { url: e.target.value })} placeholder="https://…"
                        className={`${inputCls} flex-1`} aria-label={`Link ${i + 1} URL`} type="url" />
                      <button type="button" onClick={() => removeLinkRow(i)} aria-label={`Remove link ${i + 1}`}
                        className="mt-1 shrink-0 rounded-lg p-2 text-ink-faint transition-colors hover:text-maroon-text">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {links.length < 20 && (
                <button type="button" onClick={addLinkRow}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-sand px-3.5 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:border-green/40">
                  <Plus size={15} aria-hidden /> Add a link
                </button>
              )}

              {linksErr && <p className="mt-3 rounded-lg border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay-text">{linksErr}</p>}
              <div className="mt-4 flex items-center gap-3">
                <button onClick={saveLinks} disabled={linksState === "saving" || !linksDirty}
                  className="rounded-full bg-green px-5 py-2 text-sm font-semibold text-on-green transition-colors hover:bg-green-900 disabled:opacity-50">
                  {linksState === "saving" ? "Saving…" : "Save links"}
                </button>
                {linksState === "saved" && !linksDirty && <span className="text-sm font-medium text-teal-text">Saved ✓</span>}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
