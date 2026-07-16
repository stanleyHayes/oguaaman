import { useState } from "react";
import { Link, useLoaderData, useRevalidator } from "react-router-dom";
import { api } from "@/lib/api";
import { PORTAL } from "@/lib/portal";
import type { InstitutionKind, InstitutionRequest, Organization } from "@/lib/types";
import { Card, Empty, Pill } from "@/components/ui";
import { Stagger, StaggerItem } from "@/components/motion";
import { BadgeCheck, Landmark } from "lucide-react";

interface Data {
  orgs: Organization[];
  kinds: InstitutionKind[];
  requests: InstitutionRequest[];
}

export async function loader(): Promise<Data> {
  const [orgs, kinds, requests] = await Promise.all([
    api.myInstitutions(),
    api.institutionKinds().catch(() => [] as InstitutionKind[]),
    api.myInstitutionRequests().catch(() => [] as InstitutionRequest[]),
  ]);
  return { orgs, kinds, requests };
}

const field =
  "w-full rounded-lg border border-sand bg-paper px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-green focus:outline-none focus:ring-2 focus:ring-green/15";
const label = "mb-1.5 block text-sm font-medium text-ink";

const STATUS_TONE: Record<string, "gold" | "green" | "clay" | "neutral"> = {
  pending: "gold", approved: "green", rejected: "clay",
};

export function Component() {
  const { orgs, kinds, requests } = useLoaderData() as Data;
  const { revalidate } = useRevalidator();
  const [name, setName] = useState("");
  const [kind, setKind] = useState(kinds[0]?.slug ?? "school");
  const [seat, setSeat] = useState("");
  const [role, setRole] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit() {
    setBusy(true);
    setFlash(null);
    try {
      await api.requestInstitution({ name: name.trim(), kind, seat: seat.trim(), role: role.trim(), note: note.trim() });
      setFlash({ ok: true, text: "Request sent — a steward reviews it. Once approved, the page is created and you're its first manager." });
      setName(""); setSeat(""); setRole(""); setNote("");
      revalidate();
    } catch (e) {
      setFlash({ ok: false, text: (e as Error).message || "Couldn't send the request." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mb-6">
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-gold-text">My work</p>
        <h1 className="mt-1 text-3xl font-semibold text-ink">Institutions you manage</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Schools, traditional councils, churches and associations whose official pages you're an approved manager of.
          Claim a page on the portal; a steward verifies the claim.
        </p>
      </div>

      {orgs.length === 0 ? (
        <Empty icon="building" title="No institutions yet" actions={
          <a href={`${PORTAL}/education`} className="rounded-full bg-green px-4 py-2 text-sm font-semibold text-cream">Browse institutions on the portal</a>
        }>
          Find your school, council or association on the portal and tap “Claim this page” — once a steward approves, it shows up here.
        </Empty>
      ) : (
        <Card className="overflow-hidden px-4">
          <Stagger as="ul" className="divide-y divide-sand">
            {orgs.map((o, idx) => (
              <StaggerItem as="li" key={o.id} index={idx} className="py-3.5">
                <div className="flex items-center gap-3">
                  {o.crestUrl ? (
                    <img src={o.crestUrl} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" loading="lazy" />
                  ) : (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-green/[0.08] text-green"><Landmark size={18} aria-hidden /></span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{o.name}</p>
                    <p className="text-xs capitalize text-ink-faint">{o.kind}{o.classification ? ` · ${o.classification}` : ""}</p>
                  </div>
                  {o.verified && <Pill tone="green"><BadgeCheck size={12} className="mr-1" aria-hidden />Verified</Pill>}
                  <Link to={`/team/${o.slug}`}
                    className="shrink-0 rounded-full border border-gold-brand px-3.5 py-1.5 text-xs font-semibold text-gold-text transition-colors hover:bg-gold-brand hover:text-green-900">
                    Open workspace
                  </Link>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </Card>
      )}

      <Card className="mt-6 p-6">
        <h2 className="text-xl font-semibold text-ink">Request a new institution</h2>
        <p className="mt-1 mb-4 text-sm text-ink-muted">
          Can’t find your school, council or association? Tell us — a steward creates and verifies the page,
          and you become its first manager.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="req-name" className={label}>Institution name</label>
            <input id="req-name" className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aboom Methodist JHS" />
          </div>
          <div>
            <label htmlFor="req-kind" className={label}>Kind</label>
            <select id="req-kind" className={field} value={kind} onChange={(e) => setKind(e.target.value)}>
              {kinds.map((k) => <option key={k.slug} value={k.slug}>{k.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="req-seat" className={label}>Seat (town / quarter)</label>
            <input id="req-seat" className={field} value={seat} onChange={(e) => setSeat(e.target.value)} placeholder="e.g. Aboom, Cape Coast" />
          </div>
          <div>
            <label htmlFor="req-role" className={label}>Your office (optional)</label>
            <input id="req-role" className={field} value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Founder, Headteacher" />
          </div>
        </div>
        <div className="mt-4">
          <label htmlFor="req-note" className={label}>Note for the steward (optional)</label>
          <textarea id="req-note" rows={2} className={`resize-none ${field}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything that helps verify the institution — a GES number, a chief's palace, a website…" />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button type="button" onClick={submit} disabled={busy || name.trim().length < 2 || !seat.trim()}
            className="rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-green-900 disabled:opacity-60">
            Send request
          </button>
          {flash && <span className={`text-sm ${flash.ok ? "text-teal-text" : "text-clay-text"}`}>{flash.text}</span>}
        </div>

        {requests.length > 0 && (
          <div className="mt-5 border-t border-dashed border-sand pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">Your requests</p>
            <ul className="divide-y divide-sand">
              {requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{r.newOrg.name}</p>
                    <p className="text-xs text-ink-faint">{kinds.find((k) => k.slug === r.newOrg.kind)?.label ?? r.newOrg.kind} · {r.newOrg.seat} · as {r.requestedRole}</p>
                  </div>
                  <Pill tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</Pill>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <p className="mt-4 text-xs text-ink-faint">
        Open a workspace to edit the institution's profile, sections, gallery, offices and events — right here in the app.
      </p>
    </>
  );
}
