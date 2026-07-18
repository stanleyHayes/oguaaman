import { useState } from "react";
import { Link, useLoaderData, useSearchParams, type LoaderFunctionArgs } from "react-router-dom";
import { api } from "@/lib/api";
import type { Member, Paged } from "@/lib/types";
import { PageHeader, Card, RoleBadge, Select } from "@/components/ui";
import { Stagger, StaggerItem } from "@/components/motion";
import { Pagination, usePagedRows } from "@/components/pagination";
import { formatDate, initials } from "@/lib/format";
import { cldAvatar } from "@/lib/cloudinary";
import { BusyLabel } from "@/components/skeleton";
import { AlertTriangle, AtSign, Check, ShieldCheck, UserRound, UsersRound } from "lucide-react";

const INVITE_ROLES = [
  { value: "editor", label: "Editor", detail: "Publishes and maintains newsroom stories." },
  { value: "curator", label: "Curator", detail: "Reviews submissions and manages listings." },
  { value: "accountability", label: "Accountability", detail: "Tracks projects, commitments, and outcomes." },
  { value: "vetting", label: "Vetting officer", detail: "Vets & approves Oguaa Outside agents; resolves disputes." },
  { value: "steward", label: "Steward", detail: "Has full access across the admin console." },
  { value: "member", label: "Member", detail: "Receives standard community access." },
] as const;

export async function loader({ request }: LoaderFunctionArgs) {
  const page = Number(new URL(request.url).searchParams.get("page")) || 1;
  return api.membersPaged({ page });
}

export function Component() {
  const data = useLoaderData() as Paged<Member>;
  const [rows, setRows] = usePagedRows(data);
  const [, setParams] = useSearchParams();
  const [busy, setBusy] = useState<string | null>(null);

  function goToPage(p: number) {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("page", String(p));
      return next;
    });
  }
  const [inv, setInv] = useState({ identifier: "", displayName: "", role: "curator" });
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const selectedInviteRole = INVITE_ROLES.find((role) => role.value === inv.role) ?? INVITE_ROLES[1];
  const inviteReady = Boolean(inv.identifier.trim() && inv.displayName.trim()) && !inviteBusy;

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
      <PageHeader kicker={`${data.total} members`} title="Members & roles" />

      <Card className="mb-5 overflow-hidden shadow-[var(--shadow-card)]">
        <div className="grid lg:grid-cols-[minmax(17rem,0.72fr)_minmax(0,1.55fr)]">
          <section className="relative isolate overflow-hidden bg-green-900 p-5 text-on-green sm:p-6">
            <div className="pointer-events-none absolute -right-16 -top-20 -z-10 h-56 w-56 rounded-full border border-gold/20" aria-hidden />
            <div className="pointer-events-none absolute -right-5 -top-8 -z-10 h-32 w-32 rounded-full bg-gold/[0.08]" aria-hidden />
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-on-green/15 bg-on-green/10 text-gold">
              <UsersRound size={21} aria-hidden />
            </div>
            <p className="mt-5 text-[0.68rem] font-bold uppercase tracking-[0.18em] text-gold">Team access</p>
            <h2 className="mt-2 text-2xl font-semibold leading-tight !text-on-green">Invite a team member</h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-on-green/70">
              Pre-assign access by phone or email. Their role activates the moment they sign in.
            </p>

            <div className="mt-5 border-t border-on-green/10 pt-4">
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-on-green/45">Access preview</p>
              <div className="mt-2.5 flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold text-green-900">
                  <ShieldCheck size={18} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-on-green">{selectedInviteRole.label}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-on-green/60">{selectedInviteRole.detail}</span>
                </span>
              </div>
            </div>
          </section>

          <form
            className="p-5 sm:p-6"
            aria-busy={inviteBusy}
            onSubmit={(event) => {
              event.preventDefault();
              void invite();
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-ink">Invitation details</p>
                <p className="mt-0.5 text-xs text-ink-faint">All three fields can be changed before sending.</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-sand bg-paper px-2.5 py-1 text-[0.68rem] font-semibold text-ink-muted">
                <Check size={12} className="text-teal-text" aria-hidden />
                Activates on sign-in
              </span>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-ink-muted" htmlFor="invite-name">
                Full name
                <span className="relative mt-2 block">
                  <UserRound size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden />
                  <input
                    id="invite-name"
                    name="displayName"
                    autoComplete="name"
                    required
                    value={inv.displayName}
                    onChange={(event) => setInv({ ...inv, displayName: event.target.value })}
                    placeholder="e.g. Efua Mensah"
                    className="h-12 w-full rounded-xl border border-sand bg-paper pl-10 pr-3 text-sm text-ink shadow-sm transition-[border-color,box-shadow] placeholder:text-ink-faint/70 focus:border-green focus:outline-none focus:ring-2 focus:ring-green/10"
                  />
                </span>
              </label>

              <label className="block text-xs font-semibold text-ink-muted" htmlFor="invite-identifier">
                Phone or email
                <span className="relative mt-2 block">
                  <AtSign size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden />
                  <input
                    id="invite-identifier"
                    name="identifier"
                    autoComplete="username"
                    required
                    value={inv.identifier}
                    onChange={(event) => setInv({ ...inv, identifier: event.target.value })}
                    placeholder="name@oguaa.test or +233…"
                    className="h-12 w-full rounded-xl border border-sand bg-paper pl-10 pr-3 text-sm text-ink shadow-sm transition-[border-color,box-shadow] placeholder:text-ink-faint/70 focus:border-green focus:outline-none focus:ring-2 focus:ring-green/10"
                  />
                </span>
              </label>
            </div>

            <div className="mt-4 grid items-end gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
              <label className="block text-xs font-semibold text-ink-muted" htmlFor="invite-role">
                Role
                <Select
                  id="invite-role"
                  value={inv.role}
                  onValueChange={(role) => setInv({ ...inv, role })}
                  aria-describedby="invite-role-description"
                  className="mt-2 w-full"
                  icon={<ShieldCheck size={17} aria-hidden />}
                  triggerClassName="min-h-12 rounded-xl"
                >
                  {INVITE_ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                </Select>
                <span id="invite-role-description" className="mt-1.5 block text-[0.7rem] font-normal leading-4 text-ink-faint">
                  {selectedInviteRole.detail}
                </span>
              </label>

              <button
                type="submit"
                disabled={!inviteReady}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-green px-5 text-sm font-semibold text-on-green shadow-[0_10px_24px_-14px_rgba(12,44,31,0.85)] transition-[transform,background-color,opacity] hover:-translate-y-0.5 hover:bg-green-900 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45 sm:min-w-36"
              >
                {inviteBusy ? <BusyLabel label="Inviting team member" className="justify-center" tone="dark" /> : <><UsersRound size={17} aria-hidden /> Send invite</>}
              </button>
            </div>

            {inviteMsg && (
              <div
                role={inviteMsg.ok ? "status" : "alert"}
                aria-live="polite"
                className={`mt-4 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs leading-5 ${inviteMsg.ok ? "border-teal/20 bg-teal/[0.07] text-teal-text" : "border-clay/25 bg-clay/[0.07] text-clay-text"}`}
              >
                {inviteMsg.ok ? <Check size={16} className="mt-0.5 shrink-0" aria-hidden /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />}
                <span>{inviteMsg.text}</span>
              </div>
            )}
          </form>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-sand bg-paper text-left text-xs uppercase tracking-wide text-ink-faint">
            <tr><th className="px-4 py-3">Member</th><th className="px-4 py-3 hidden sm:table-cell">Joined</th><th className="px-4 py-3">Role</th><th className="px-4 py-3 text-right">Manage</th></tr>
          </thead>
          <Stagger as="tbody">
            {rows.map((m, idx) => (
              <StaggerItem as="tr" key={m.id} index={idx} className={`border-b border-sand last:border-0 ${m.suspended ? "opacity-55" : ""}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {m.photoUrl
                      ? <img src={cldAvatar(m.photoUrl, 36)} alt={`${m.displayName} profile photo`} className="h-9 w-9 shrink-0 rounded-full border border-sand object-cover" />
                      : <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-green text-xs font-semibold text-on-green">{initials(m.displayName)}</span>}
                    <div>
                      <div className="font-medium"><Link to={`/members/${m.slug}`} className="hover:text-gold-text hover:underline">{m.displayName}</Link> {m.suspended && <span className="ml-1 text-xs font-semibold text-maroon-text">· suspended</span>}</div>
                      {m.bio && <div className="text-xs text-ink-faint">{m.bio}</div>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 hidden text-ink-faint sm:table-cell">{formatDate(m.joinedAt)}</td>
                <td className="px-4 py-3"><RoleBadge role={m.role} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {busy === m.id ? <BusyLabel label="Updating member" className="justify-end" width="w-12" /> : <>
                      <Select value={m.role} onValueChange={(role) => changeRole(m, role)} className="w-32" size="compact" triggerClassName="capitalize" optionClassName="capitalize">
                        <option value="member">member</option><option value="editor">editor</option><option value="curator">curator</option><option value="accountability">accountability</option><option value="vetting">vetting</option><option value="steward">steward</option>
                      </Select>
                      <button type="button" onClick={() => toggleSuspend(m)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${m.suspended ? "border-green-text/40 text-green-text" : "border-maroon-text/40 text-maroon-text"}`}>
                        {m.suspended ? "Unsuspend" : "Suspend"}
                      </button>
                    </>}
                  </div>
                </td>
              </StaggerItem>
            ))}
          </Stagger>
        </table>
      </Card>
      <Pagination page={data.page} totalPages={data.totalPages} onChange={goToPage} total={data.total} pageSize={data.pageSize} />
      <p className="mt-3 text-xs text-ink-faint">Role assignment and suspension are steward actions. Changes persist to MongoDB.</p>
    </>
  );
}
