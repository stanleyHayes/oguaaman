import { useState } from "react";
import { Link, useLoaderData, useSearchParams, type LoaderFunctionArgs } from "react-router-dom";
import { api } from "@/lib/api";
import type { Organization, Paged } from "@/lib/types";
import { PageHeader, Card } from "@/components/ui";
import { Stagger, StaggerItem } from "@/components/motion";
import { Pagination, usePagedRows } from "@/components/pagination";
import { InstitutionLogo } from "@/components/crest";
import { formatDate } from "@/lib/format";

const KIND_LABEL: Record<string, string> = {
  school: "School", "traditional-authority": "Traditional authority", association: "Association",
  faith: "Faith body", civic: "Civic body", business: "Business", asafo: "Asafo company",
  authority: "Authority", heritage: "Heritage place",
};

function count(n: number | undefined, one: string, many: string): string {
  const c = n ?? 0;
  return `${c} ${c === 1 ? one : many}`;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const page = Number(new URL(request.url).searchParams.get("page")) || 1;
  return api.institutionsPaged({ page });
}

export function Component() {
  const data = useLoaderData() as Paged<Organization>;
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

  async function toggle(o: Organization) {
    setBusy(o.id);
    try {
      const { verified } = await api.verify(o.id, !o.verified);
      setRows((cur) => cur.map((x) => (x.id === o.id ? { ...x, verified, verifiedOn: verified ? new Date().toISOString().slice(0, 10) : undefined } : x)));
    } finally { setBusy(null); }
  }

  return (
    <>
      <PageHeader kicker="Verification & trust" title="Institutions & verification" />
      <p className="mb-5 max-w-2xl text-sm text-ink-muted">
        Grant the verified-official badge only after confirming standing through recognised channels (GES/metro directorate for schools; recognised councils for traditional authorities). The platform documents and hosts — it does not adjudicate disputes.
      </p>

      {rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-ink-muted">No institutions yet.</Card>
      ) : (
        <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((o, idx) => (
            <StaggerItem key={o.id} index={idx}>
              <Card className="flex h-full flex-col p-5 transition-shadow hover:shadow-[var(--shadow-lift)]">
                <div className="flex items-start gap-3">
                  <InstitutionLogo org={o} size={44} />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-lg font-semibold text-ink">
                      <Link to={`/institutions/${o.slug}`} className="hover:text-gold-text hover:underline">{o.name}</Link>
                    </h3>
                    <p className="text-xs text-ink-faint">
                      {o.classification || KIND_LABEL[o.kind] || o.kind}
                      {o.founded ? ` · Est. ${o.founded}` : ""}
                    </p>
                  </div>
                  {o.verified ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gold/[0.14] px-2 py-0.5 text-[0.7rem] font-semibold text-gold-text" title={o.verifiedOn ? `Verified ${formatDate(o.verifiedOn)}` : "Verified"}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2l2.4 1.8 3 .1 1 2.8 2.4 1.7-.9 2.8.9 2.8-2.4 1.7-1 2.8-3 .1L12 22l-2.4-1.8-3-.1-1-2.8L3.2 15l.9-2.8L3.2 9.4 5.6 7.7l1-2.8 3-.1z" /></svg>
                      Verified
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-sand px-2 py-0.5 text-[0.7rem] font-semibold text-ink-muted">Unverified</span>
                  )}
                </div>

                {o.summary && <p className="mt-3 line-clamp-3 text-sm text-ink-muted">{o.summary}</p>}

                <div className="mt-auto flex items-center justify-between gap-2 border-t border-sand pt-3 text-xs text-ink-faint">
                  <span>
                    {KIND_LABEL[o.kind] ?? o.kind} · {count((o.offices ?? []).length, "office", "offices")}
                  </span>
                  <button type="button"
                    disabled={busy === o.id}
                    onClick={() => toggle(o)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-50 ${o.verified ? "border-sand text-ink-muted hover:bg-cream" : "border-gold-border/60 text-gold-text hover:bg-gold/[0.1]"}`}
                  >
                    {busy === o.id ? "…" : o.verified ? "Revoke" : "Verify"}
                  </button>
                </div>
              </Card>
            </StaggerItem>
          ))}
        </Stagger>
      )}

      <Pagination page={data.page} totalPages={data.totalPages} onChange={goToPage} total={data.total} pageSize={data.pageSize} />
    </>
  );
}
