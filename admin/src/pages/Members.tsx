import { useState } from "react";
import { Link, useLoaderData } from "react-router-dom";
import { api } from "@/lib/api";
import type { Member } from "@/lib/types";
import { PageHeader, Card, RoleBadge } from "@/components/ui";
import { formatDate, initials } from "@/lib/format";
import { cldAvatar } from "@/lib/cloudinary";

export async function loader() {
  return api.members();
}

export function Component() {
  const initial = useLoaderData() as Member[];
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [inv, setInv] = useState({ identifier: "", displayName: "", role: "curator" });
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function changeRole(m: Member, role: string) {
    setBusy(m.id);
    try { await api.setRole(m.id, role); setRows((cur) => cur.map((x) => (x.id === m.id ? { ...x, role: role as Member["role"] } : x))); }
    finally { setBusy(null); }
  }
  async function toggleSuspend(m: Member) {
    setBusy(m.id);
    try { const { suspended } = await api.suspend(m.id, !m.suspended); setRows((cur) => cur.map((x) => (x.id === m.id ? { ...x, suspended } : x))); }
    finally { setBusy(null); }
  }
  async function invite() {
    if (!inv.identifier.trim() || !inv.displayName.trim() || inviteBusy) return;
    setInviteBusy(true); setInviteMsg(null);
    try {
      const m = await api.invite(inv);
      setRows((cur) => [m, ...cur]);
      setInviteMsg({ ok: true, text: `${m.displayName} invited as ${m.role}. They get it on first sign-in.` });
      setInv({ identifier: "", displayName: "", role: "curator" });
    } catch (e) {
      setInviteMsg({ ok: false, text: (e as Error).message });
    } finally { setInviteBusy(false); }
  }

  return (
    <>
      <PageHeader kicker={`${rows.length} members`} title="Members & roles" />

      <Card className="mb-5 p-5">
        <h2 className="font-display text-lg font-semibold">Invite a team member</h2>
        <p className="mt-1 text-sm text-ink-muted">Pre-assign a role by phone or email. They hold it the moment they sign in.</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-xs text-ink-faint">Name
            <input value={inv.displayName} onChange={(e) => setInv({ ...inv, displayName: e.target.value })} placeholder="Full name" className="mt-1 w-44 rounded-lg border border-sand bg-cream px-3 py-2 text-sm text-ink focus:border-ai focus:outline-none" />
          </label>
          <label className="flex flex-col text-xs text-ink-faint">Phone or email
            <input value={inv.identifier} onChange={(e) => setInv({ ...inv, identifier: e.target.value })} placeholder="name@oguaa.test" className="mt-1 w-52 rounded-lg border border-sand bg-cream px-3 py-2 text-sm text-ink focus:border-ai focus:outline-none" />
          </label>
          <label className="flex flex-col text-xs text-ink-faint">Role
            <select value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value })} className="mt-1 rounded-lg border border-sand bg-cream px-3 py-2 text-sm capitalize focus:border-ai focus:outline-none">
              <option value="editor">editor</option><option value="curator">curator</option><option value="steward">steward</option><option value="member">member</option>
            </select>
          </label>
          <button onClick={invite} disabled={inviteBusy} className="rounded-full bg-ai px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">{inviteBusy ? "Inviting…" : "Invite"}</button>
          {inviteMsg && <span className={`text-sm ${inviteMsg.ok ? "text-green" : "text-clay-text"}`}>{inviteMsg.text}</span>}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-sand bg-paper text-left text-xs uppercase tracking-wide text-ink-faint">
            <tr><th className="px-4 py-3">Member</th><th className="px-4 py-3 hidden sm:table-cell">Joined</th><th className="px-4 py-3">Role</th><th className="px-4 py-3 text-right">Manage</th></tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className={`border-b border-sand last:border-0 ${m.suspended ? "opacity-55" : ""}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {m.photoUrl
                      ? <img src={cldAvatar(m.photoUrl, 36)} alt="" className="h-9 w-9 shrink-0 rounded-full border border-sand object-cover" />
                      : <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-green text-xs font-semibold text-cream">{initials(m.displayName)}</span>}
                    <div>
                      <div className="font-medium"><Link to={`/members/${m.slug}`} className="hover:text-gold-text hover:underline">{m.displayName}</Link> {m.suspended && <span className="ml-1 text-xs font-semibold text-maroon-900">· suspended</span>}</div>
                      {m.bio && <div className="text-xs text-ink-faint">{m.bio}</div>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 hidden text-ink-faint sm:table-cell">{formatDate(m.joinedAt)}</td>
                <td className="px-4 py-3"><RoleBadge role={m.role} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <select disabled={busy === m.id} value={m.role} onChange={(e) => changeRole(m, e.target.value)} className="rounded-lg border border-sand bg-cream px-2 py-1 text-xs capitalize focus:border-ai focus:outline-none">
                      <option value="member">member</option><option value="editor">editor</option><option value="curator">curator</option><option value="steward">steward</option>
                    </select>
                    <button disabled={busy === m.id} onClick={() => toggleSuspend(m)} className={`rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-50 ${m.suspended ? "border-green/40 text-green" : "border-maroon-900/40 text-maroon-900"}`}>
                      {m.suspended ? "Unsuspend" : "Suspend"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="mt-3 text-xs text-ink-faint">Role assignment and suspension are steward actions (spec §9, §8.10). Changes persist to MongoDB.</p>
    </>
  );
}
