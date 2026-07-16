// Team management UI (Creator plan §4.1.2): the roster with manager-only
// actions (invite, promote/demote, revoke), and the signed-in member's own
// pending invitations with accept/decline.
import { useState } from "react";
import type { Invitation, TeamView } from "@/lib/types";
import { api } from "@/lib/api";
import { Pill } from "@/components/ui";
import { Panel } from "@/components/institution-panels";

const field =
  "w-full rounded-lg border border-sand bg-paper px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-green focus:outline-none focus:ring-2 focus:ring-green/15";
const btnPrimary =
  "rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-on-green transition-colors hover:bg-green-900 disabled:opacity-60";

type Flash = { kind: "ok" | "err"; text: string } | null;

function initials(name: string): string {
  return name.split(/\s+/).map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase();
}

export function TeamPanel({ slug, view, meId, onChanged }: Readonly<{ slug: string; view: TeamView; meId: string; onChanged: () => void }>) {
  const isManager = view.viewerScope === "manager";
  const [identifier, setIdentifier] = useState("");
  const [role, setRole] = useState("");
  const [scope, setScope] = useState<"officer" | "manager">("officer");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<Flash>(null);

  async function run(action: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setFlash(null);
    try {
      await action();
      setFlash({ kind: "ok", text: ok });
      onChanged();
    } catch (e) {
      setFlash({ kind: "err", text: (e as Error).message || "Something went wrong." });
    } finally {
      setBusy(false);
    }
  }

  async function invite() {
    if (!identifier.trim() || !role.trim()) return;
    await run(
      () => api.inviteToTeam(slug, { identifier: identifier.trim(), role: role.trim(), scope }),
      "Invitation sent — they’ll see it in their creator app.",
    );
    setIdentifier(""); setRole(""); setScope("officer");
  }

  return (
    <Panel title="Team">
      <p className="mb-4 text-sm text-ink-muted">
        Managers can edit everything and run the team; officers edit content only (profile, sections, gallery, events).
      </p>

      <ul className="divide-y divide-sand">
        {view.team.map((t) => (
          <li key={t.claimId} className="flex flex-wrap items-center gap-3 py-3">
            {t.photoUrl ? (
              <img src={t.photoUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" loading="lazy" />
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green/[0.08] text-xs font-bold text-green-text">
                {initials(t.memberName || "?")}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{t.memberName || t.memberId}</p>
              <p className="text-xs text-ink-faint">
                {t.role}
                {t.status === "invited" && t.invitedByName ? ` · invited by ${t.invitedByName}` : ""}
              </p>
            </div>
            <Pill tone={t.scope === "manager" ? "gold" : "neutral"}>{t.scope}</Pill>
            {t.status === "invited" && <Pill tone="clay">invited</Pill>}
            {isManager && t.memberId !== meId && (
              <span className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy || t.status !== "approved"}
                  onClick={() => run(() => api.setTeamScope(slug, t.memberId, t.scope === "manager" ? "officer" : "manager"), "Scope updated.")}
                  className="rounded-full border border-sand px-3 py-1.5 text-xs font-semibold text-ink-muted transition-colors hover:border-green/40 hover:text-green-text disabled:opacity-40"
                >
                  {t.scope === "manager" ? "Make officer" : "Make manager"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => api.revokeTeamMember(slug, t.memberId), "Removed from the team.")}
                  className="rounded-full border border-sand px-3 py-1.5 text-xs font-semibold text-clay-text transition-colors hover:border-clay disabled:opacity-40"
                >
                  Remove
                </button>
              </span>
            )}
          </li>
        ))}
        {view.team.length === 0 && <li className="py-3 text-sm text-ink-faint">No team members yet.</li>}
      </ul>

      {isManager && (
        <div className="mt-4 border-t border-dashed border-sand pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">Invite someone</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input className={field} value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="Their email or phone" />
            <input className={field} value={role} onChange={(e) => setRole(e.target.value)} placeholder="Office (e.g. PTA Chair)" />
            <select className={field} value={scope} onChange={(e) => setScope(e.target.value as "officer" | "manager")} aria-label="Team scope">
              <option value="officer">Officer — content only</option>
              <option value="manager">Manager — full control</option>
            </select>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button type="button" onClick={invite} disabled={busy || !identifier.trim() || !role.trim()} className={btnPrimary}>
              Send invitation
            </button>
            {flash && <span className={`text-sm ${flash.kind === "ok" ? "text-teal-text" : "text-clay-text"}`}>{flash.text}</span>}
          </div>
        </div>
      )}
      {!isManager && flash && <p className={`mt-3 text-sm ${flash.kind === "ok" ? "text-teal-text" : "text-clay-text"}`}>{flash.text}</p>}
    </Panel>
  );
}

export function InvitationsPanel({ items, onChanged }: Readonly<{ items: Invitation[]; onChanged: () => void }>) {
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<Flash>(null);
  if (items.length === 0) return null;

  async function respond(id: string, accept: boolean) {
    setBusy(true);
    setFlash(null);
    try {
      await api.respondToInvite(id, accept);
      onChanged();
    } catch (e) {
      setFlash({ kind: "err", text: (e as Error).message || "Something went wrong." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Invitations for you">
      <ul className="divide-y divide-sand">
        {items.map((inv) => (
          <li key={inv.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">{inv.orgName}</p>
              <p className="text-xs text-ink-faint">
                {inv.invitedByName ? `${inv.invitedByName} invited you` : "You’re invited"} as {inv.requestedRole}
              </p>
            </div>
            <Pill tone={inv.scope === "manager" ? "gold" : "neutral"}>{inv.scope}</Pill>
            <span className="flex items-center gap-2">
              <button type="button" onClick={() => respond(inv.id, true)} disabled={busy} className="rounded-full bg-green px-4 py-1.5 text-xs font-semibold text-on-green transition-colors hover:bg-green-900 disabled:opacity-60">
                Accept
              </button>
              <button type="button" onClick={() => respond(inv.id, false)} disabled={busy} className="rounded-full border border-sand px-4 py-1.5 text-xs font-semibold text-ink-muted transition-colors hover:border-clay hover:text-clay-text disabled:opacity-60">
                Decline
              </button>
            </span>
          </li>
        ))}
      </ul>
      {flash && <p className={`mt-2 text-sm ${flash.kind === "ok" ? "text-teal-text" : "text-clay-text"}`}>{flash.text}</p>}
    </Panel>
  );
}
