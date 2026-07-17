import { useState } from "react";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router-dom";
import { api } from "@/lib/api";
import type { InstitutionView, Organization, Listing, TeamMember } from "@/lib/types";
import { BackLink, Card, Empty, StatusBadge, KeyVal } from "@/components/ui";
import { AiWritingBar } from "@/components/ai-writing-bar";
import { InstitutionLogo } from "@/components/crest";
import { InstitutionEditor } from "@/components/institution-editor";
import { formatDate } from "@/lib/format";

const KIND_LABEL: Record<string, string> = {
  school: "School", "traditional-authority": "Traditional authority", association: "Association",
  faith: "Faith body", civic: "Civic body", business: "Business", asafo: "Asafo company",
};

interface PageData extends InstitutionView { team: TeamMember[] }

export async function loader({ params }: LoaderFunctionArgs): Promise<PageData> {
  const [view, team] = await Promise.all([
    api.institution(params.slug!),
    api.institutionTeam(params.slug!).catch(() => [] as TeamMember[]),
  ]);
  // Coerce every list to an array: a 200 with a null/error-shaped body (e.g. an
  // endpoint that lost its data) would otherwise slip past the .catch above and
  // crash the render with "x.map is not a function".
  const asArray = <U,>(v: unknown): U[] => (Array.isArray(v) ? (v as U[]) : []);
  return {
    ...view,
    events: asArray<Listing>(view.events),
    officialEvents: asArray<Listing>(view.officialEvents),
    team: asArray<TeamMember>(team),
  };
}

function EventList({ title, items }: Readonly<{ title: string; items: Listing[] }>) {
  if (!items || items.length === 0) return null;
  return (
    <Card className="overflow-hidden">
      <h2 className="border-b border-sand px-5 py-3 text-lg font-semibold">{title}</h2>
      <ul>
        {items.map((l) => (
          <li key={l.id} className="border-b border-sand last:border-0">
            <Link to={`/listings/${l.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-paper">
              <span className="min-w-0 truncate font-medium text-ink">{l.title}</span>
              <StatusBadge status={l.status} />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function Component() {
  const { institution, events, officialEvents, team: initialTeam } = useLoaderData() as PageData;
  const [o, setO] = useState<Organization>(institution);
  const [team, setTeam] = useState<TeamMember[]>(initialTeam);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  async function toggleVerify() {
    setBusy(true);
    try {
      const { verified } = await api.verify(o.id, !o.verified);
      setO((x) => ({ ...x, verified, verifiedOn: verified ? new Date().toISOString().slice(0, 10) : undefined }));
    } finally { setBusy(false); }
  }

  async function revokeTeamMember(memberId: string) {
    setRevoking(memberId);
    try {
      await api.revokeTeamMember(o.slug, memberId);
      setTeam((prev) => prev.filter((m) => m.memberId !== memberId));
    } finally { setRevoking(null); }
  }

  return (
    <>
      <BackLink to="/institutions">All institutions</BackLink>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-4">
            <InstitutionLogo org={o} size={56} />
            <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-paper px-2.5 py-0.5 text-xs font-medium text-ink-muted">{KIND_LABEL[o.kind] ?? o.kind}</span>
              {o.verified
                ? <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/[0.14] px-2.5 py-0.5 text-xs font-semibold text-gold-text"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2l2.4 1.8 3 .1 1 2.8 2.4 1.7-.9 2.8.9 2.8-2.4 1.7-1 2.8-3 .1L12 22l-2.4-1.8-3-.1-1-2.8L3.2 15l.9-2.8L3.2 9.4 5.6 7.7l1-2.8 3-.1z" /></svg>Verified{o.verifiedOn ? ` · ${formatDate(o.verifiedOn)}` : ""}</span>
                : <span className="rounded-full bg-sand px-2.5 py-0.5 text-xs font-semibold text-ink-muted">Unverified</span>}
            </div>
            <h1 className="mt-2 text-3xl font-semibold text-ink">{o.name}</h1>
            {o.officialTitle && <p className="mt-0.5 text-sm text-ink-muted">{o.officialTitle}</p>}
            {o.motto && <p className="mt-1 text-lg italic text-gold-text">“{o.motto}”</p>}
            </div>
          </div>
          {o.houseColors && o.houseColors.length > 0 && (
            <div className="flex gap-1.5">{o.houseColors.map((c) => <span key={c} className="h-6 w-6 rounded-full border border-sand" style={{ backgroundColor: c }} title={c} />)}</div>
          )}
        </div>
        {o.summary && <p className="mt-4 max-w-2xl leading-relaxed text-ink-muted">{o.summary}</p>}
        {(o.summary || o.history) && (
          <div className="mt-4 border-t border-sand pt-3">
            <AiWritingBar initialTitle={o.name} initialBody={o.summary ?? ""} />
          </div>
        )}
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="mb-2 text-lg font-semibold">Facts</h2>
            <dl>
              <KeyVal label="Founded">{o.founded ? String(o.founded) : undefined}</KeyVal>
              <KeyVal label="Classification">{o.classification}</KeyVal>
              <KeyVal label="Jurisdiction">{o.jurisdiction}</KeyVal>
              <KeyVal label="Old students">{o.osaName}</KeyVal>
              <KeyVal label="Members">{o.memberCount != null ? String(o.memberCount) : undefined}</KeyVal>
              <KeyVal label="Slug">/{o.slug}</KeyVal>
            </dl>
            {o.contact && o.contact.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {o.contact.map((c) => <a key={c.url} href={c.url} target="_blank" rel="noopener noreferrer" className="rounded-full border border-sand px-3 py-1 text-xs text-ink-muted hover:border-gold-border/50">{c.label}</a>)}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-lg font-semibold">Verification</h2>
            <p className="mb-3 text-sm text-ink-muted">Grant the badge only after confirming standing through recognised channels. The platform documents — it does not adjudicate.</p>
            <button disabled={busy} onClick={toggleVerify} className={`w-full rounded-lg border px-4 py-2.5 text-sm font-semibold disabled:opacity-50 ${o.verified ? "border-sand text-ink-muted hover:bg-paper" : "border-gold-border/60 bg-gold/[0.08] text-gold-text hover:bg-gold/[0.16]"}`}>
              {o.verified ? "Revoke verification" : "Verify institution"}
            </button>
          </Card>

          <Card className="overflow-hidden">
            <h2 className="border-b border-sand px-5 py-3 text-lg font-semibold">
              Team ({team.length})
            </h2>
            {team.length === 0 ? (
              <div className="px-5 py-4 text-sm text-ink-muted">No managers or officers yet.</div>
            ) : (
              <ul>
                {team.map((m) => (
                  <li key={m.memberId} className="flex items-center justify-between gap-3 border-b border-sand px-5 py-3 last:border-0">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{m.memberName}</p>
                      <p className="text-xs text-ink-faint capitalize">{m.scope} · {m.role || "—"}{m.status === "invited" ? " · invited" : ""}</p>
                    </div>
                    <button
                      disabled={revoking === m.memberId}
                      onClick={() => revokeTeamMember(m.memberId)}
                      className="shrink-0 rounded-full border border-clay/40 px-3 py-1 text-xs font-semibold text-clay hover:bg-clay/10 disabled:opacity-50"
                    >
                      {revoking === m.memberId ? "Removing…" : "Remove"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="overflow-hidden">
            <h2 className="border-b border-sand px-5 py-3 text-lg font-semibold">Offices ({(o.offices ?? []).length})</h2>
            {(o.offices ?? []).length === 0 ? (
              <Empty compact icon="building" title="No offices recorded" />
            ) : (
              <ul>
                {(o.offices ?? []).map((off) => (
                  <li key={off.id} className="flex items-center justify-between gap-3 border-b border-sand px-5 py-3 last:border-0">
                    <div>
                      <p className="font-medium text-ink">{off.role}</p>
                      {off.holderName && <p className="text-xs text-ink-faint">{off.holderName}</p>}
                    </div>
                    {off.verified && <span className="rounded-full bg-green/[0.1] px-2.5 py-0.5 text-xs font-semibold text-green-text">verified</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {((o.sections?.length ?? 0) > 0 || (o.gallery?.length ?? 0) > 0) && (
            <Card className="overflow-hidden">
              <h2 className="border-b border-sand px-5 py-3 text-lg font-semibold">
                Official page <span className="text-sm font-normal text-ink-faint">· manager-published</span>
              </h2>
              <div className="px-5 py-3">
                <p className="text-sm text-ink-muted">
                  {(o.gallery?.length ?? 0)} gallery photo{(o.gallery?.length ?? 0) === 1 ? "" : "s"} · {(o.sections?.length ?? 0)} custom section{(o.sections?.length ?? 0) === 1 ? "" : "s"}
                </p>
                {o.sections && o.sections.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {o.sections.map((s) => (
                      <li key={s.id} className="flex items-center gap-2 text-sm">
                        <span className="rounded-full bg-paper px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wider text-ink-muted">{s.type}</span>
                        <span className="text-ink">{s.title || "(untitled)"}</span>
                        {s.hidden && <span className="text-xs text-ink-faint">· hidden</span>}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-xs text-ink-faint">Published directly by the institution's verified managers. Revoke verification to take the page offline if needed.</p>
              </div>
            </Card>
          )}

          <EventList title="Official events" items={officialEvents} />
          <EventList title="Community events" items={events} />
        </div>
      </div>

      <section className="mt-6 border-t border-sand pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-ink">Official page</h2>
            <p className="text-sm text-ink-muted">Configure this place's summary, history, sections and photos — it renders live on the public site.</p>
          </div>
          <button type="button" onClick={() => setEditing((v) => !v)} className="shrink-0 rounded-full border border-green-text/40 px-4 py-2 text-sm font-semibold text-green-text hover:border-green-text">
            {editing ? "Close editor" : "Configure page"}
          </button>
        </div>
        {editing && <div className="mt-5"><InstitutionEditor slug={o.slug} org={o} /></div>}
      </section>
    </>
  );
}
