import { useState } from "react";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router-dom";
import { api } from "@/lib/api";
import type { MemberView, Member } from "@/lib/types";
import { BackLink, Card, RoleBadge, StatusBadge, KeyVal } from "@/components/ui";
import { formatDate, initials } from "@/lib/format";
import { cldAvatar } from "@/lib/cloudinary";

export async function loader({ params }: LoaderFunctionArgs): Promise<MemberView> {
  return api.member(params.slug!);
}

export function Component() {
  const view = useLoaderData() as MemberView;
  const [m, setM] = useState<Member>(view.member);
  const [busy, setBusy] = useState(false);

  const quarter = view.places.find((p) => p.id === m.townId && p.kind !== "asafo");
  const asafo = view.places.find((p) => p.id === m.asafoId);
  const schoolName = (id: string) => view.schools.find((s) => s.id === id)?.name ?? id;
  const schooling = m.schooling?.length
    ? m.schooling.map((s) => (s.fromYear || s.toYear ? `${schoolName(s.schoolId)} (${s.fromYear ?? "?"}–${s.toYear ?? "?"})` : schoolName(s.schoolId)))
    : m.schoolIds.map(schoolName);

  async function changeRole(role: string) {
    setBusy(true);
    try { await api.setRole(m.id, role); setM((x) => ({ ...x, role: role as Member["role"] })); }
    finally { setBusy(false); }
  }
  async function toggleSuspend() {
    setBusy(true);
    try { const { suspended } = await api.suspend(m.id, !m.suspended); setM((x) => ({ ...x, suspended })); }
    finally { setBusy(false); }
  }

  return (
    <>
      <BackLink to="/members">All members</BackLink>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {m.photoUrl
            ? <img src={cldAvatar(m.photoUrl, 80)} alt="" className="h-20 w-20 shrink-0 rounded-full border border-sand object-cover" />
            : <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-green text-2xl font-semibold text-cream">{initials(m.displayName)}</span>}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <RoleBadge role={m.role} />
              {m.suspended && <span className="rounded-full bg-maroon-900/[0.1] px-2.5 py-0.5 text-xs font-semibold text-maroon-900">Suspended</span>}
              {m.phoneVerified && <span className="rounded-full bg-green/[0.1] px-2.5 py-0.5 text-xs font-semibold text-green">Verified</span>}
            </div>
            <h1 className="mt-1.5 font-display text-3xl font-semibold text-ink">{m.displayName}</h1>
            {m.bio && <p className="mt-1 max-w-2xl text-sm text-ink-muted">{m.bio}</p>}
          </div>
        </div>
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="mb-2 font-display text-lg font-semibold">Profile</h2>
            <dl>
              <KeyVal label="Joined">{formatDate(m.joinedAt)}</KeyVal>
              <KeyVal label="Quarter">{quarter?.name}</KeyVal>
              <KeyVal label="Asafo">{asafo?.name}</KeyVal>
              <KeyVal label="Schooling">{schooling.length ? schooling.join(", ") : undefined}</KeyVal>
              <KeyVal label="Birthday">{m.birthday ? `${m.birthday}${m.broadcastBirthday ? " · broadcast" : ""}` : undefined}</KeyVal>
            </dl>
            {m.links && m.links.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {m.links.map((lnk) => <a key={lnk.url} href={lnk.url} target="_blank" rel="noopener noreferrer" className="rounded-full border border-sand px-3 py-1 text-xs text-ink-muted hover:border-gold-border/50">{lnk.label}</a>)}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 font-display text-lg font-semibold">Manage</h2>
            <label className="block text-xs font-semibold uppercase tracking-wide text-ink-faint">Role
              <select disabled={busy} value={m.role} onChange={(e) => changeRole(e.target.value)} className="mt-1 w-full rounded-lg border border-sand bg-cream px-3 py-2 text-sm capitalize focus:border-gold-border focus:outline-none">
                <option value="member">member</option><option value="editor">editor</option><option value="curator">curator</option><option value="steward">steward</option>
              </select>
            </label>
            <button disabled={busy} onClick={toggleSuspend} className={`mt-3 w-full rounded-lg border px-4 py-2.5 text-sm font-semibold disabled:opacity-50 ${m.suspended ? "border-green/40 text-green hover:bg-green/[0.06]" : "border-maroon-900/40 text-maroon-900 hover:bg-maroon-900/[0.06]"}`}>
              {m.suspended ? "Unsuspend member" : "Suspend member"}
            </button>
            <p className="mt-2 text-xs text-ink-faint">Role &amp; suspension are steward actions (spec §9, §8.10).</p>
          </Card>
        </div>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-sand px-5 py-3">
            <h2 className="font-display text-lg font-semibold">Contributions</h2>
            <span className="text-xs text-ink-faint">{view.listings.length}</span>
          </div>
          {view.listings.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-ink-muted">No contributions yet.</p>
          ) : (
            <ul>
              {view.listings.map((l) => (
                <li key={l.id} className="border-b border-sand last:border-0">
                  <Link to={`/listings/${l.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-paper">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{l.title}</p>
                      <p className="text-xs capitalize text-ink-faint">{l.type}</p>
                    </div>
                    <StatusBadge status={l.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
