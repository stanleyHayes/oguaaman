import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PORTAL } from "@/lib/portal";
import { Card, RoleBadge } from "@/components/ui";
import { formatDate, initials } from "@/lib/format";
import { Briefcase, Palette, CalendarDays, Landmark, LogOut, type LucideIcon } from "lucide-react";

const CREATOR_TYPES: { id: string; label: string; desc: string; icon: LucideIcon }[] = [
  { id: "business", label: "Business owner", desc: "Shops, services, food & drink", icon: Briefcase },
  { id: "artist", label: "Artist", desc: "Music, craft, performance", icon: Palette },
  { id: "organiser", label: "Event organiser", desc: "Ticketed shows and gatherings", icon: CalendarDays },
  { id: "institution", label: "Institution manager", desc: "Schools, heritage, civic and community bodies", icon: Landmark },
];

export function Component() {
  const { member, setMember, signOut } = useAuth();
  const [types, setTypes] = useState<string[]>(member?.creatorTypes ?? []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!member) return null;
  const dirty = JSON.stringify([...types].sort()) !== JSON.stringify([...(member.creatorTypes ?? [])].sort());

  function toggle(id: string) {
    setSaved(false);
    setTypes((cur) => (cur.includes(id) ? cur.filter((t) => t !== id) : [...cur, id]));
  }

  async function save() {
    setBusy(true); setErr(null); setSaved(false);
    try {
      const updated = await api.setCreatorTypes(types);
      setMember(updated);
      setSaved(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
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
        <Card className="overflow-hidden">
          <div className="h-20 bg-gradient-to-br from-green/[0.12] via-cream to-gold/[0.1]" aria-hidden />
          <div className="px-5 pb-5">
            <div className="-mt-10">
              {member.photoUrl ? (
                <img src={member.photoUrl} alt="" className="h-20 w-20 rounded-full object-cover ring-4 ring-cream" />
              ) : (
                <span className="flex h-20 w-20 items-center justify-center rounded-full bg-gold/15 text-2xl font-bold text-gold-text ring-4 ring-cream">{initials(member.displayName)}</span>
              )}
            </div>
            <p className="mt-3 truncate text-xl font-semibold text-ink">{member.displayName}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <RoleBadge role={member.role} />
              <span className="text-xs text-ink-faint">Joined {formatDate(member.joinedAt)}</span>
            </div>
            <p className="mt-4 text-sm text-ink-muted">
              Your public profile, photo, bio and links live on the{" "}
              <a href={`${PORTAL}/me`} className="font-semibold text-gold-text hover:underline">community portal</a>.
            </p>
            <div className="mt-5 border-t border-sand pt-4">
              <button onClick={signOut} className="inline-flex items-center gap-2 rounded-full border border-maroon-text/40 px-4 py-2 text-sm font-semibold text-maroon-text transition-colors hover:bg-maroon-900/[0.06]">
                <LogOut size={15} aria-hidden /> Sign out
              </button>
            </div>
          </div>
        </Card>

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
                  <button key={ct.id} type="button" onClick={() => toggle(ct.id)} aria-pressed={on}
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
            {err && <p className="mt-3 rounded-lg border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay-text">{err}</p>}
            <div className="mt-4 flex items-center gap-3">
              <button onClick={save} disabled={busy || !dirty}
                className="rounded-full bg-green px-5 py-2 text-sm font-semibold text-on-green transition-colors hover:bg-green-900 disabled:opacity-50">
                {busy ? "Saving…" : "Save creator types"}
              </button>
              {saved && <span className="text-sm font-medium text-teal-text">Saved ✓</span>}
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
