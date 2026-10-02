import { useState, type ReactNode } from "react";
import { useLoaderData, useNavigation, useSearchParams, type LoaderFunctionArgs } from "react-router-dom";
import { api } from "@/lib/api";
import type { AdSponsor, AdSponsorKind, AdSponsorStatus } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { isCuratorOrAbove } from "@/lib/roles";
import { PageHeader, Empty, KeyVal, Select } from "@/components/ui";
import { FlagChip, Notice, Panel, ReadOnlyNotice, ReasonAction, ToneChip } from "@/components/admin-kit";
import { PrivateDocument } from "@/components/private-document";
import { Skeleton, SkeletonGroup } from "@/components/skeleton";
import { SPONSOR_STATUS_TONE } from "@/lib/ads";
import { formatDate, formatDateTime, humanize } from "@/lib/format";
import { describeError } from "@/lib/errors";
import { btnDanger, btnDangerOutline, btnPrimary, segmentCls } from "@/lib/ui-classes";

const STATUSES: readonly AdSponsorStatus[] = ["pending", "verified", "rejected", "suspended"];
const STATUS_LABEL: Record<AdSponsorStatus, string> = { pending: "Pending", verified: "Verified", rejected: "Rejected", suspended: "Suspended" };
const OFFICE_LABEL: Record<string, string> = {
  presidential: "Presidential", parliamentary: "Parliamentary", district_assembly: "District Assembly",
  party_internal: "Party internal", issue: "Issue campaign",
};

interface Data { sponsors: AdSponsor[]; status: AdSponsorStatus; kind: AdSponsorKind | "" }

export async function loader({ request }: LoaderFunctionArgs): Promise<Data> {
  const url = new URL(request.url);
  const status = (url.searchParams.get("status") ?? "pending") as AdSponsorStatus;
  const kind = (url.searchParams.get("kind") ?? "") as AdSponsorKind | "";
  const sponsors = await api.adSponsors({ status, kind });
  return { sponsors: sponsors ?? [], status, kind };
}

function SponsorDetail({ sponsor, canAct, onChanged }: Readonly<{ sponsor: AdSponsor; canAct: boolean; onChanged: (s: AdSponsor, message: string) => void }>) {
  const s = sponsor;
  const idDoc = s.idDocumentUrl;
  const ecDoc = s.ecAuthorisationUrl;
  let idDocument: ReactNode;
  if (idDoc) idDocument = <PrivateDocument docRef={idDoc} label="ID document" />;
  else if (s.hasIdDocument) idDocument = "On file";
  const act = (action: "verify" | "reject" | "suspend", done: string) => async (note: string) => {
    try {
      onChanged(await api.reviewAdSponsor(s.id, action, note), done);
    } catch (e) {
      throw new Error(describeError(e, {}, "We couldn't update the sponsor. Try again."), { cause: e });
    }
  };
  return (
    <Panel
      title={s.displayName}
      aside={s.legalName !== s.displayName ? `Legal name: ${s.legalName}` : undefined}
      action={<div className="flex flex-wrap gap-1.5"><ToneChip tone={SPONSOR_STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</ToneChip>{s.kind === "political" && <FlagChip tone="clay">Political</FlagChip>}</div>}
    >
      <p className="mb-3 text-sm text-ink-muted">
        Readers will see <span className="font-semibold text-ink">{s.kind === "political" ? `Paid for by ${s.legalName}` : `Sponsored · ${s.displayName}`}</span>
      </p>
      <dl>
        <KeyVal label="Entity">{humanize(s.entityType)}</KeyVal>
        <KeyVal label="Registration">{s.registrationNumber}</KeyVal>
        <KeyVal label="TIN">{s.tin}</KeyVal>
        <KeyVal label="Ghana Card">{s.idNumberLast4 ? `•••• ${s.idNumberLast4}` : undefined}</KeyVal>
        <KeyVal label="ID document">{idDocument}</KeyVal>
        <KeyVal label="Address">{s.address}</KeyVal>
        <KeyVal label="Contact person">{s.contactPerson}</KeyVal>
        <KeyVal label="Phone">{s.phone}</KeyVal>
        <KeyVal label="Email">{s.email}</KeyVal>
        <KeyVal label="Party">{s.partyName}</KeyVal>
        <KeyVal label="Candidate">{s.candidateName}</KeyVal>
        <KeyVal label="Office">{s.office ? OFFICE_LABEL[s.office] ?? humanize(s.office) : undefined}</KeyVal>
        <KeyVal label="Constituency">{s.constituency}</KeyVal>
        <KeyVal label="EC authorisation">{ecDoc ? <PrivateDocument docRef={ecDoc} label="EC authorisation" /> : undefined}</KeyVal>
        <KeyVal label="Citizenship">{s.citizenshipDeclaredAt ? `Declared ${formatDateTime(s.citizenshipDeclaredAt)}` : undefined}</KeyVal>
        <KeyVal label="Submitted">{formatDate(s.createdAt)}</KeyVal>
        <KeyVal label="Reviewed">{s.verifiedAt ? `${formatDate(s.verifiedAt)}${s.verifiedByName ? ` by ${s.verifiedByName}` : ""}` : undefined}</KeyVal>
        <KeyVal label="Review note">{s.reviewNote}</KeyVal>
      </dl>

      {canAct ? (
        <div className="mt-5 grid gap-2 border-t border-sand pt-4 sm:grid-cols-2">
          {(s.status === "pending" || s.status === "suspended") && (
            <ReasonAction
              label={s.status === "suspended" ? "Reinstate" : "Verify"}
              confirmLabel={s.status === "suspended" ? "Reinstate sponsor" : "Verify sponsor"}
              placeholder="What you checked (optional), e.g. ORC register BN-2291"
              minLength={0}
              maxLength={500}
              buttonClass={`${btnPrimary} w-full`}
              busyLabel="Verifying sponsor"
              onConfirm={act("verify", `${s.displayName} is verified. Their ads can now be approved.`)}
            />
          )}
          {s.status === "pending" && (
            <ReasonAction
              label="Reject"
              confirmLabel="Reject sponsor"
              placeholder="What is missing or wrong. The advertiser reads this."
              maxLength={500}
              buttonClass={`${btnDangerOutline} w-full`}
              confirmClass={btnDanger}
              busyLabel="Rejecting sponsor"
              onConfirm={act("reject", `${s.displayName} was rejected. They can correct the details and resubmit.`)}
            />
          )}
          {s.status === "verified" && (
            <ReasonAction
              label="Suspend"
              confirmLabel="Suspend sponsor"
              placeholder="Why. Their running ads pause too."
              description="Suspending pauses every running campaign from this sponsor."
              maxLength={500}
              buttonClass={`${btnDangerOutline} w-full`}
              confirmClass={btnDanger}
              busyLabel="Suspending sponsor"
              onConfirm={act("suspend", `${s.displayName} is suspended and their running ads are paused.`)}
            />
          )}
        </div>
      ) : (
        <p className="mt-5 border-t border-sand pt-4 text-sm text-ink-muted">Curators verify, reject and suspend sponsors.</p>
      )}
    </Panel>
  );
}

export function Component() {
  const { sponsors: loaded, status, kind } = useLoaderData() as Data;
  const [params, setParams] = useSearchParams();
  const navigation = useNavigation();
  const loading = navigation.state === "loading" && navigation.location?.pathname === "/ad-sponsors";
  const { member } = useAuth();
  const canAct = isCuratorOrAbove(member?.role);
  const [overrides, setOverrides] = useState<Record<string, AdSponsor>>({});
  const [notice, setNotice] = useState("");
  const sponsors = loaded.map((s) => overrides[s.id] ?? s);
  const selectedId = params.get("sponsor") ?? sponsors[0]?.id;
  const selected = sponsors.find((s) => s.id === selectedId) ?? sponsors[0];

  const go = (next: { status?: string; kind?: string; sponsor?: string }) => {
    const p = new URLSearchParams();
    const st = next.status ?? status;
    const k = next.kind ?? kind;
    if (st !== "pending") p.set("status", st);
    if (k) p.set("kind", k);
    if (next.sponsor) p.set("sponsor", next.sponsor);
    setParams(p, { replace: Boolean(next.sponsor) });
  };

  return (
    <>
      <PageHeader tone="gold" kicker="Monetization" title="Ad sponsors" lede="Everyone who pays for an ad is verified first. Political sponsors show who is legally responsible: readers see “Paid for by” with this name." />

      {!canAct && <div className="mb-5"><ReadOnlyNotice>You can read sponsor records. Curators verify, reject and suspend them.</ReadOnlyNotice></div>}
      {notice && <div className="mb-5"><Notice tone="ok" onDismiss={() => setNotice("")}>{notice}</Notice></div>}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter by status">
          <div className="flex flex-wrap gap-1 rounded-[1.4rem] border border-sand bg-paper p-1 sm:inline-flex">
            {STATUSES.map((s) => (
              <button key={s} type="button" aria-pressed={status === s} onClick={() => go({ status: s })} className={segmentCls(status === s)}>{STATUS_LABEL[s]}</button>
            ))}
          </div>
        </nav>
        <Select aria-label="Sponsor kind" value={kind} onValueChange={(v) => go({ kind: v })} className="w-48">
          <option value="">Commercial and political</option>
          <option value="political">Political</option>
          <option value="commercial">Commercial</option>
        </Select>
      </div>

      {loading && (
        <SkeletonGroup label="Loading sponsors" className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <div className="space-y-2">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
          <Skeleton className="h-96 w-full rounded-[var(--radius-card)]" />
        </SkeletonGroup>
      )}
      {!loading && sponsors.length === 0 && (
        <Empty icon={status === "pending" ? "check" : "building"} title={status === "pending" ? "No sponsors waiting" : `No ${STATUS_LABEL[status].toLowerCase()} sponsors`}>
          {status === "pending" ? "New sponsor details appear here when an advertiser submits them from the Advertise page." : "Try another status."}
        </Empty>
      )}
      {!loading && sponsors.length > 0 && selected && (
        <div className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <ul className="space-y-2" aria-label="Sponsors">
            {sponsors.map((s) => {
              const on = s.id === selected.id;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-current={on ? "true" : undefined}
                    onClick={() => go({ sponsor: s.id })}
                    className={`w-full rounded-xl border px-4 py-3 text-left transition-[background-color,border-color,transform] duration-200 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 ${on ? "border-gold-border/60 bg-cream shadow-[var(--shadow-card)]" : "border-sand bg-paper hover:border-gold-border/40"}`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold text-ink">{s.displayName}</span>
                      {s.kind === "political" && <FlagChip tone="clay">Political</FlagChip>}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-ink-muted">{humanize(s.entityType)} · submitted {formatDate(s.createdAt)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <SponsorDetail
            key={selected.id}
            sponsor={selected}
            canAct={canAct}
            onChanged={(next, message) => { setOverrides((o) => ({ ...o, [next.id]: { ...selected, ...next } })); setNotice(message); }}
          />
        </div>
      )}
      {!loading && sponsors.length > 0 && <p className="mt-4 text-xs text-ink-faint">Documents open privately with your staff session.</p>}
    </>
  );
}
