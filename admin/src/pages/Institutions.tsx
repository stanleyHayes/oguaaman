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
};

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
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-sand bg-paper text-left text-xs uppercase tracking-wide text-ink-faint">
            <tr><th className="px-4 py-3">Institution</th><th className="px-4 py-3 hidden sm:table-cell">Kind</th><th className="px-4 py-3 hidden md:table-cell">Offices</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Action</th></tr>
          </thead>
          <Stagger as="tbody">
            {rows.map((o, idx) => (
              <StaggerItem as="tr" key={o.id} index={idx} className="border-b border-sand last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <InstitutionLogo org={o} size={40} />
                    <div className="min-w-0">
                      <div className="font-medium"><Link to={`/institutions/${o.slug}`} className="hover:text-gold-text hover:underline">{o.name}</Link></div>
                      {o.founded && <div className="text-xs text-ink-faint">Est. {o.founded}{o.osaName ? ` · ${o.osaName}` : ""}</div>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 hidden text-ink-muted sm:table-cell">{KIND_LABEL[o.kind] ?? o.kind}</td>
                <td className="px-4 py-3 hidden text-ink-faint md:table-cell">{(o.offices ?? []).length}</td>
                <td className="px-4 py-3">
                  {o.verified ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/[0.14] px-2.5 py-0.5 text-xs font-semibold text-gold-text">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2l2.4 1.8 3 .1 1 2.8 2.4 1.7-.9 2.8.9 2.8-2.4 1.7-1 2.8-3 .1L12 22l-2.4-1.8-3-.1-1-2.8L3.2 15l.9-2.8L3.2 9.4 5.6 7.7l1-2.8 3-.1z" /></svg>
                      Verified{o.verifiedOn ? ` · ${formatDate(o.verifiedOn)}` : ""}
                    </span>
                  ) : <span className="rounded-full bg-sand px-2.5 py-0.5 text-xs font-semibold text-ink-muted">Unverified</span>}
                </td>
                <td className="px-4 py-3 text-right">
                  <button disabled={busy === o.id} onClick={() => toggle(o)} className={`rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-50 ${o.verified ? "border-sand text-ink-muted" : "border-gold-border/60 text-gold-text hover:bg-gold/[0.1]"}`}>
                    {o.verified ? "Revoke" : "Verify"}
                  </button>
                </td>
              </StaggerItem>
            ))}
          </Stagger>
        </table>
      </Card>
      <Pagination page={data.page} totalPages={data.totalPages} onChange={goToPage} total={data.total} pageSize={data.pageSize} />
    </>
  );
}
