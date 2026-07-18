import { useState } from "react";
import { useLoaderData, useRevalidator } from "react-router-dom";
import { api } from "@/lib/api";
import type { Agent, AgentBondStatus, AgentStatus, AgentType } from "@/lib/types";
import { PageHeader, Card, Empty, Pill } from "@/components/ui";
import { Stagger, StaggerItem } from "@/components/motion";
import { formatDate } from "@/lib/format";
import { BusyLabel } from "@/components/skeleton";
import { useAuth } from "@/lib/auth";

/** A non-vetting staff member who reaches the page directly gets a friendly wall
 *  instead of the route error boundary — the loader detects the 403 and returns
 *  this sentinel rather than throwing. */
const FORBIDDEN = { forbidden: true } as const;
type AgentsData = Agent[] | typeof FORBIDDEN;

export async function loader(): Promise<AgentsData> {
  try {
    return await api.adminAgents();
  } catch (e) {
    if ((e as { status?: number }).status === 403) return FORBIDDEN;
    throw e;
  }
}

const FORBIDDEN_MSG = "Only a vetting officer can approve agents.";

const cedis = (pesewas?: number) =>
  `GH₵ ${((pesewas ?? 0) / 100).toLocaleString("en-GH", { maximumFractionDigits: 2 })}`;

const labelCls = "mb-1 block text-xs font-medium text-ink-muted";
const inputCls = "w-full rounded-lg border border-sand bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-green-text focus:outline-none focus:ring-2 focus:ring-green/15";

type Tone = "neutral" | "green" | "gold" | "clay";

// Section header + card chip per status. `badge` is the solid chip on the card.
const STATUS_META: Record<AgentStatus, { label: string; tone: Tone; badge: string }> = {
  pending: { label: "Pending review", tone: "gold", badge: "bg-gold/[0.18] text-gold-text" },
  verified: { label: "Verified", tone: "green", badge: "bg-green text-on-green" },
  suspended: { label: "Suspended", tone: "clay", badge: "bg-clay text-white" },
  rejected: { label: "Rejected", tone: "clay", badge: "bg-maroon-900/[0.1] text-maroon-text" },
};
const STATUS_ORDER: AgentStatus[] = ["pending", "verified", "suspended", "rejected"];

const TYPE_LABEL: Record<AgentType, string> = { individual: "Individual", office: "Office" };

const BOND_META: Record<AgentBondStatus, { label: string; badge: string }> = {
  pending: { label: "Bond pending", badge: "bg-gold/[0.18] text-gold-text" },
  held: { label: "Bond held", badge: "bg-green/[0.1] text-green-text" },
  refunded: { label: "Bond refunded", badge: "bg-sand text-ink-muted" },
  forfeited: { label: "Bond forfeited", badge: "bg-maroon-900/[0.1] text-maroon-text" },
};

function sortAgents(list: Agent[]): Agent[] {
  // Oldest applications first within a group (fairest for a review queue).
  return [...list].sort((a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0));
}

export function Component() {
  const data = useLoaderData() as AgentsData;
  const { revalidate } = useRevalidator();
  const { member } = useAuth();
  const role = member?.role;
  const canVet = role === "vetting" || role === "steward";

  if ("forbidden" in data) {
    return (
      <>
        <PageHeader kicker="Oguaa Outside · background checks" title="Vetting queue" />
        <Empty icon="shield" tone="gold" title="Vetting officers only">{FORBIDDEN_MSG}</Empty>
      </>
    );
  }

  const agents = data;
  const groups = STATUS_ORDER
    .map((status) => ({ status, items: sortAgents(agents.filter((a) => a.status === status)) }))
    .filter((group) => group.items.length > 0);

  const pendingCount = agents.filter((a) => a.status === "pending").length;
  const verifiedCount = agents.filter((a) => a.status === "verified").length;

  return (
    <>
      <PageHeader kicker="Oguaa Outside · background checks" title="Vetting queue">
        <div className="flex flex-wrap items-center gap-2">
          {pendingCount > 0 && <Pill tone="gold">{pendingCount} pending review</Pill>}
          <Pill tone={verifiedCount > 0 ? "green" : "neutral"}>{verifiedCount} verified</Pill>
        </div>
      </PageHeader>

      <p className="mb-5 max-w-2xl text-sm text-ink-muted">
        Local agents who run paid, escrow-backed errands for diaspora clients. A vetting officer approves an applicant
        only after a background check — verifying the ID document, calling the guarantor, and confirming the good-conduct
        bond is posted. Verified agents can be suspended if trust breaks down.
      </p>

      {agents.length === 0 ? (
        <Empty icon="users" title="No agent applications yet">
          {canVet ? "Applications land here for a background check before they can take jobs." : "Nothing to review yet."}
        </Empty>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.status}>
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-sm font-bold uppercase tracking-wide text-ink-muted">{STATUS_META[group.status].label}</h2>
                <Pill tone={STATUS_META[group.status].tone}>{group.items.length}</Pill>
              </div>
              <Stagger className="space-y-3">
                {group.items.map((a, idx) => (
                  <StaggerItem key={a.id} index={idx}>
                    <AgentCard agent={a} canVet={canVet} onChanged={revalidate} />
                  </StaggerItem>
                ))}
              </Stagger>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

interface AgentCardProps {
  agent: Agent;
  canVet: boolean;
  onChanged: () => void;
}

function AgentCard({ agent, canVet, onChanged }: Readonly<AgentCardProps>) {
  const [busy, setBusy] = useState<null | "verify" | "suspend" | "reject">(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const meta = STATUS_META[agent.status];
  const bond = BOND_META[agent.bond.status];

  function friendly(e: unknown): string {
    const status = (e as { status?: number }).status;
    if (status === 403) return FORBIDDEN_MSG;
    return e instanceof Error ? e.message : "Could not complete that action.";
  }

  async function run(kind: "verify" | "suspend", fn: () => Promise<unknown>) {
    setBusy(kind); setError(null);
    try { await fn(); onChanged(); }
    catch (e) { setError(friendly(e)); }
    finally { setBusy(null); }
  }

  function verify() {
    void run("verify", () => api.verifyAgent(agent.id));
  }
  function suspend() {
    if (!window.confirm(`Suspend ${agent.displayName}? They will be pulled from Oguaa Outside and cannot take new jobs.`)) return;
    void run("suspend", () => api.suspendAgent(agent.id));
  }

  async function submitReject() {
    if (!reason.trim()) { setError("A reason is required to reject an applicant."); return; }
    setBusy("reject"); setError(null);
    try {
      await api.rejectAgent(agent.id, reason.trim());
      setRejecting(false); setReason("");
      onChanged();
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className={`p-5 ${agent.status === "rejected" || agent.status === "suspended" ? "opacity-95" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.badge}`}>{meta.label}</span>
        <Pill tone="neutral">{TYPE_LABEL[agent.type]}</Pill>
        {agent.ratingCount > 0 && <Pill tone="gold">★ {agent.ratingAvg.toFixed(1)} · {agent.ratingCount}</Pill>}
        <Pill tone="neutral">{agent.jobsCompleted} jobs done</Pill>
      </div>

      <h3 className="mt-2 text-lg font-semibold text-ink">{agent.displayName}</h3>
      {agent.headline && <p className="mt-0.5 text-sm font-medium text-ink-muted">{agent.headline}</p>}
      {agent.bio && <p className="mt-1 max-w-2xl text-sm text-ink-muted">{agent.bio}</p>}

      {(agent.services.length > 0 || agent.coverageAreas.length > 0) && (
        <div className="mt-3 space-y-2">
          {agent.services.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Services</span>
              {agent.services.map((s) => <Pill key={s} tone="green">{s}</Pill>)}
            </div>
          )}
          {agent.coverageAreas.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Areas</span>
              {agent.coverageAreas.map((a) => <Pill key={a} tone="neutral">{a}</Pill>)}
            </div>
          )}
          {agent.rates && <p className="text-sm text-ink"><span className="font-semibold">Rates · </span>{agent.rates}</p>}
        </div>
      )}

      {/* Background-check dossier — the evidence the officer signs off on. */}
      <div className="mt-4 rounded-xl border border-sand bg-paper px-4 py-3">
        <p className="text-[0.65rem] font-bold uppercase tracking-wide text-ink-faint">Background check</p>
        <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-ink-faint">ID document</dt>
            <dd className="text-sm text-ink">
              {agent.idDocUrl
                ? <a href={agent.idDocUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-ai underline hover:text-green-text">View ID document</a>
                : <span className="text-ink-faint">Not provided</span>}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-faint">Good-conduct bond</dt>
            <dd className="mt-0.5 flex items-center gap-2 text-sm text-ink">
              {cedis(agent.bond.amountPesewas)}
              <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${bond.badge}`}>{bond.label}</span>
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-ink-faint">Guarantor</dt>
            <dd className="text-sm text-ink">
              {agent.guarantor
                ? <>
                    <span className="font-medium">{agent.guarantor.name}</span>
                    {" · "}<a href={`tel:${agent.guarantor.phone}`} className="text-ai underline hover:text-green-text">{agent.guarantor.phone}</a>
                    {agent.guarantor.relation ? ` · ${agent.guarantor.relation}` : ""}
                    {agent.guarantor.note ? <span className="block text-xs italic text-ink-muted">“{agent.guarantor.note}”</span> : null}
                  </>
                : <span className="text-ink-faint">No guarantor on file</span>}
            </dd>
          </div>
          {(agent.payoutMethod || agent.payoutDetail) && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-ink-faint">Payout</dt>
              <dd className="text-sm text-ink">{[agent.payoutMethod, agent.payoutDetail].filter(Boolean).join(" · ")}</dd>
            </div>
          )}
        </dl>
      </div>

      <p className="mt-2 text-xs text-ink-faint">
        Applied {formatDate(agent.createdAt)}
        {agent.verifiedByName ? ` · verified by ${agent.verifiedByName}` : ""}
        {agent.verifiedAt ? ` · ${formatDate(agent.verifiedAt)}` : ""}
      </p>

      {agent.status === "rejected" && agent.rejectionReason && (
        <p className="mt-2 rounded-lg border border-maroon-text/25 bg-maroon-900/[0.04] px-3 py-2 text-sm text-maroon-text">
          <span className="font-semibold">Rejected · </span>{agent.rejectionReason}
        </p>
      )}

      {canVet && (agent.status === "pending" || agent.status === "verified") && !rejecting && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-sand pt-4">
          {agent.status === "pending" && (
            <>
              <button type="button" disabled={busy !== null} onClick={verify} className="rounded-full bg-green px-4 py-1.5 text-xs font-semibold text-on-green hover:bg-green-900 disabled:opacity-50">
                {busy === "verify" ? <BusyLabel label="Verifying agent" className="justify-center" /> : "Verify"}
              </button>
              <button type="button" disabled={busy !== null} onClick={() => { setRejecting(true); setReason(""); setError(null); }} className="rounded-full border border-maroon-text/40 px-4 py-1.5 text-xs font-semibold text-maroon-text hover:bg-maroon-900/[0.05] disabled:opacity-50">
                Reject
              </button>
            </>
          )}
          {agent.status === "verified" && (
            <button type="button" disabled={busy !== null} onClick={suspend} className="rounded-full border border-clay/40 px-4 py-1.5 text-xs font-semibold text-clay-text hover:bg-clay/[0.06] disabled:opacity-50">
              {busy === "suspend" ? <BusyLabel label="Suspending agent" className="justify-center" /> : "Suspend"}
            </button>
          )}
        </div>
      )}

      {canVet && rejecting && (
        <div className="mt-3 rounded-xl border border-sand bg-paper p-4">
          <p className="text-sm font-semibold text-ink">Reject {agent.displayName}</p>
          <label className="mt-2 block"><span className={labelCls}>Reason (required — the applicant is told why)</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={inputCls} placeholder="What failed the background check…" /></label>
          {error && <p className="mt-2 text-sm text-clay-text">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={submitReject} disabled={busy !== null} className="rounded-full bg-clay px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {busy === "reject" ? <BusyLabel label="Rejecting applicant" className="justify-center" /> : "Reject applicant"}
            </button>
            <button type="button" onClick={() => { setRejecting(false); setError(null); }} className="rounded-full border border-sand px-4 py-1.5 text-xs text-ink-muted hover:bg-cream">Cancel</button>
          </div>
        </div>
      )}

      {/* A 403 (or other failure) from a direct action lands here. */}
      {error && !rejecting && <p className="mt-2 text-sm text-clay-text">{error}</p>}
    </Card>
  );
}
