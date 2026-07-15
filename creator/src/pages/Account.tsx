import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PORTAL } from "@/lib/portal";
import { Card } from "@/components/ui";
import { formatDate, initials } from "@/lib/format";
import { Briefcase, Palette, CalendarDays, type LucideIcon } from "lucide-react";

const CREATOR_TYPES: { id: string; label: string; desc: string; icon: LucideIcon }[] = [
  { id: "business", label: "Business owner", desc: "Shops, services, food & drink", icon: Briefcase },
  { id: "artist", label: "Artist", desc: "Music, craft, performance", icon: Palette },
  { id: "organiser", label: "Event organiser", desc: "Ticketed shows and gatherings", icon: CalendarDays },
];

function roleLabel(role: string): string {
  switch (role) {
    case "curator": return "Curator";
    case "steward": return "Steward";
    case "editor": return "Editor";
    case "moderator": return "Moderator";
    default: return "Member";
  }
}

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
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center gap-4">
            {member.photoUrl ? (
              <img src={member.photoUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
            ) : (
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gold/15 text-lg font-bold text-gold-text">{initials(member.displayName)}</span>
            )}
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-ink">{member.displayName}</p>
              <p className="text-sm text-ink-faint">{roleLabel(member.role)} · joined {formatDate(member.joinedAt)}</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-ink-muted">
            Your public profile, photo, bio and links live on the{" "}
            <a href={`${PORTAL}/me`} className="font-semibold text-gold-text hover:underline">community portal</a>.
          </p>
          <button onClick={signOut} className="mt-5 rounded-full border border-clay/40 px-4 py-2 text-sm font-semibold text-clay-text transition-colors hover:bg-clay/[0.06]">
            Sign out
          </button>
        </Card>

        <Card className="p-5">
          <h2 className="text-lg font-semibold text-ink">What do you create?</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Pick every hat you wear. This tunes the studio and tells the town what to expect from you.
          </p>
          <div className="mt-4 space-y-2">
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
              className="rounded-full bg-green px-5 py-2 text-sm font-semibold text-cream transition-colors hover:bg-green-900 disabled:opacity-50">
              {busy ? "Saving…" : "Save creator types"}
            </button>
            {saved && <span className="text-sm font-medium text-teal-text">Saved ✓</span>}
          </div>
        </Card>
      </div>
    </>
  );
}
