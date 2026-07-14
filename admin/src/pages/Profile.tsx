import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { PageHeader, Card, RoleBadge, KeyVal } from "@/components/ui";
import { ImageUpload } from "@/components/image-upload";

const ROLE_POWERS: Record<string, { summary: string; can: string[] }> = {
  member: { summary: "Contributes to the community.", can: ["Submit listings, memories and memorials", "Follow people and institutions", "Manage your own profile and notifications"] },
  editor: { summary: "Runs the newsroom.", can: ["Write, edit and publish news articles", "Curate the editorial front page", "Everything a member can do"] },
  curator: { summary: "Moderates the queue and features listings.", can: ["Review and approve the moderation queue", "Feature and unfeature listings", "Everything a member can do"] },
  steward: { summary: "Full platform stewardship.", can: ["Assign roles, suspend and verify members", "Moderate listings and run the newsroom", "Trigger remembrance and manage platform operations"] },
};

function Section({ title, description, children, className = "" }: { title: string; description?: string; children: ReactNode; className?: string }) {
  return (
    <Card className={`p-5 ${className}`}>
      <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
      {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </Card>
  );
}

export function Component() {
  const { member, setMember, signOut } = useAuth();
  const [name, setName] = useState(member?.displayName ?? "");
  const [bio, setBio] = useState(member?.bio ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [err, setErr] = useState("");

  if (!member) return null;
  const powers = ROLE_POWERS[member.role] ?? ROLE_POWERS.member;
  const dirty = name.trim() !== member.displayName || bio.trim() !== (member.bio ?? "");
  const avatarInitials = (member.displayName || "?").split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  async function savePhoto(url: string) {
    try {
      await api.setPhoto(url);
      setMember({ ...member!, photoUrl: url });
    } catch { /* the uploader surfaces upload errors; save is best-effort */ }
  }

  async function saveProfile() {
    setState("saving"); setErr("");
    try {
      const updated = await api.updateProfile({ displayName: name.trim(), bio: bio.trim() || undefined });
      setMember(updated);
      setName(updated.displayName);
      setBio(updated.bio ?? "");
      setState("saved");
      setTimeout(() => setState("idle"), 1800);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save your profile.");
      setState("error");
    }
  }

  return (
    <>
      <PageHeader kicker="Your account" title="Profile" />

      {/* identity header */}
      <Card className="overflow-hidden">
        <div className="h-16 w-full bg-green-900" aria-hidden />
        <div className="flex flex-wrap items-end gap-4 px-6 pb-5">
          <span className="-mt-9 inline-flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-cream bg-green text-2xl font-semibold text-cream shadow-[var(--shadow-card)]">
            {member.photoUrl ? <img src={member.photoUrl} alt="" className="h-full w-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /> : avatarInitials}
          </span>
          <div className="min-w-0 pb-1">
            <h2 className="font-display text-2xl font-semibold text-ink">{member.displayName}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <RoleBadge role={member.role} />
              <span className="text-sm text-ink-faint">@{member.slug}</span>
            </div>
          </div>
        </div>
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {/* edit profile */}
        <Section title="Edit your profile" description="Your name and bio appear across the back-office.">
          <div className="space-y-4">
            <ImageUpload value={member.photoUrl ?? ""} onChange={savePhoto} label="Profile photo" hint="A clear headshot. Saved as soon as you upload." />
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">Display name</span>
              <input value={name} onChange={(e) => { setName(e.target.value); setState("idle"); }} className="w-full rounded-lg border border-sand bg-paper px-3.5 py-2.5 text-ink focus:border-gold-border focus:outline-none" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">Bio <span className="text-ink-faint">(optional)</span></span>
              <textarea value={bio} onChange={(e) => { setBio(e.target.value); setState("idle"); }} rows={3} maxLength={280} placeholder="A line about you and your role in Oguaa." className="w-full resize-y rounded-lg border border-sand bg-paper px-3.5 py-2.5 text-ink placeholder:text-ink-faint focus:border-gold-border focus:outline-none" />
              <span className="mt-1 block text-right text-xs text-ink-faint">{bio.length}/280</span>
            </label>
            {err && <p className="text-sm text-clay-text">{err}</p>}
            <div className="flex items-center gap-3">
              <button onClick={saveProfile} disabled={!dirty || state === "saving"} className="rounded-full bg-green px-5 py-2 text-sm font-semibold text-cream transition-colors hover:bg-green-900 disabled:opacity-50">
                {state === "saving" ? "Saving…" : "Save changes"}
              </button>
              {state === "saved" && <span className="text-sm text-green">Saved ✓</span>}
            </div>
          </div>
        </Section>

        <div className="space-y-5">
          {/* account details */}
          <Section title="Account" description="Your identity on the platform.">
            <dl>
              <KeyVal label="Role"><span className="capitalize">{member.role}</span></KeyVal>
              <KeyVal label="Handle">@{member.slug}</KeyVal>
              <KeyVal label="Member ID"><span className="font-mono text-xs text-ink-muted">{member.id}</span></KeyVal>
              <KeyVal label="Phone">
                <span className="inline-flex items-center gap-2">
                  <span className={member.phoneVerified ? "text-green" : "text-ink-muted"}>{member.phoneVerified ? "Verified" : "Not verified"}</span>
                  <span className="text-xs text-ink-faint">· kept private</span>
                </span>
              </KeyVal>
            </dl>
          </Section>

          {/* role explainer */}
          <Section title="What your role can do" description={powers.summary}>
            <ul className="space-y-2.5">
              {powers.can.map((line) => (
                <li key={line} className="flex items-start gap-2.5 text-sm text-ink">
                  <span aria-hidden className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gold/[0.18] text-gold-text">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>

      {/* security */}
      <Card className="mt-5 p-5">
        <h2 className="font-display text-lg font-semibold text-ink">Security</h2>
        <p className="mt-1 text-sm text-ink-muted">Oguaa is <b>passwordless</b> — you sign in with a one-time code sent to your phone or email, so there&rsquo;s no password to manage. Sessions last 30 days; sign out to end this one.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link to="/settings" className="rounded-full border border-sand bg-paper px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-gold-border hover:text-gold-text">Settings</Link>
          <Link to="/notifications" className="rounded-full border border-sand bg-paper px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-gold-border hover:text-gold-text">Notifications</Link>
          <button onClick={signOut} className="ml-auto rounded-full border border-maroon-900/50 px-4 py-2 text-sm font-semibold text-maroon-900 transition-colors hover:bg-maroon-900/[0.06]">Sign out</button>
        </div>
      </Card>
    </>
  );
}
