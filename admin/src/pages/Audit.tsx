import { useLoaderData, useSearchParams, type LoaderFunctionArgs } from "react-router-dom";
import { api } from "@/lib/api";
import type { Member, Paged, ModerationRecord } from "@/lib/types";
import { PageHeader, Card, Empty } from "@/components/ui";
import { Stagger, StaggerItem } from "@/components/motion";
import { Pagination } from "@/components/pagination";
import { formatDate, titleCase } from "@/lib/format";

interface Data { records: Paged<ModerationRecord>; members: Member[] }

export async function loader({ request }: LoaderFunctionArgs): Promise<Data> {
  const page = Number(new URL(request.url).searchParams.get("page")) || 1;
  // Records are paged; the full member list is kept for moderator-name lookups.
  const [records, members] = await Promise.all([api.auditPaged({ page }), api.members()]);
  return { records, members };
}

const ACTION_TONE: Record<string, string> = {
  approve: "text-green-text", reject: "text-maroon-text", "request-changes": "text-gold-text",
  unpublish: "text-ink-muted", flag: "text-clay-text",
};

export function Component() {
  const { records, members } = useLoaderData() as Data;
  const [, setParams] = useSearchParams();
  const nameOf = (id: string) => members.find((m) => m.id === id)?.displayName ?? id;

  function goToPage(p: number) {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("page", String(p));
      return next;
    });
  }

  return (
    <>
      <PageHeader kicker="Who · what · when · why" title="Audit log" />
      {records.items.length === 0 ? <Empty icon="shield" title="No entries yet">Every moderation action — who, what, when and why — is recorded here.</Empty> : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-sand bg-paper text-left text-xs uppercase tracking-wide text-ink-faint">
              <tr><th className="px-4 py-3">Action</th><th className="px-4 py-3">Listing</th><th className="px-4 py-3 hidden sm:table-cell">By</th><th className="px-4 py-3 hidden md:table-cell">When</th><th className="px-4 py-3">Reason</th></tr>
            </thead>
            <Stagger as="tbody">
              {records.items.map((r, idx) => (
                <StaggerItem as="tr" key={r.id} index={idx} className="border-b border-sand last:border-0">
                  <td className={`px-4 py-3 font-semibold ${ACTION_TONE[r.action] ?? "text-ink"}`}>{titleCase(r.action.replace("-", " "))}</td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-muted">{r.listingId}</td>
                  <td className="px-4 py-3 hidden text-ink-muted sm:table-cell">{nameOf(r.moderatorId)}</td>
                  <td className="px-4 py-3 hidden text-ink-faint md:table-cell">{formatDate(r.createdAt)}</td>
                  <td className="px-4 py-3 text-ink-muted">{r.reason || "—"}</td>
                </StaggerItem>
              ))}
            </Stagger>
          </table>
        </Card>
      )}
      <Pagination page={records.page} totalPages={records.totalPages} onChange={goToPage} total={records.total} pageSize={records.pageSize} />
    </>
  );
}
