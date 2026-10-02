import { Link, useLoaderData, useNavigation, useSearchParams, type LoaderFunctionArgs } from "react-router-dom";
import { api } from "@/lib/api";
import type { NewsDeskSettingsView, NewsResearchPage, ResearchJobStatus } from "@/lib/types";
import { PageHeader, Card, Empty } from "@/components/ui";
import { FlagChip, Meter, ToneChip } from "@/components/admin-kit";
import { Pagination } from "@/components/pagination";
import { TableRowsSkeleton } from "@/components/skeleton";
import { count, formatDateTime, usd } from "@/lib/format";
import { JOB_STATUS_LABEL, JOB_STATUS_ORDER, JOB_STATUS_TONE, draftFlagLabel, jobCost } from "@/lib/newsdesk";
import { segmentCls, tableHeadCls } from "@/lib/ui-classes";

const DEFAULT_STATUS: ResearchJobStatus = "ready";
const ALL = "all";

interface Data { page: NewsResearchPage; settings: NewsDeskSettingsView | null; status: string }

export async function loader({ request }: LoaderFunctionArgs): Promise<Data> {
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? DEFAULT_STATUS;
  const pageNo = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const [page, settings] = await Promise.all([
    api.newsResearchQueue({ status: status === ALL ? "" : (status as ResearchJobStatus), page: pageNo }),
    api.newsDeskSettings().catch(() => null),
  ]);
  return { page, settings, status };
}

function SpendStrip({ page, settings }: Readonly<{ page: NewsResearchPage; settings: NewsDeskSettingsView | null }>) {
  const t = page.today;
  if (!settings) {
    return (
      <p className="text-sm text-ink-muted">
        Today: <span className="tabular-nums text-ink">{t.reports}</span> reports, <span className="tabular-nums text-ink">{usd(t.researchMicroUsd)}</span> research,{" "}
        <span className="tabular-nums text-ink">{t.images}</span> images, <span className="tabular-nums text-ink">{usd(t.imageMicroUsd)}</span> image spend.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
      <Meter tone="ai" label="Reports drafted" value={t.reports} cap={settings.maxReportsPerDay} display={`${t.reports} / ${settings.maxReportsPerDay}`} />
      <Meter tone="ai" label="Research spend" value={t.researchMicroUsd} cap={settings.maxResearchMicroUsdPerDay} display={`${usd(t.researchMicroUsd)} / ${usd(settings.maxResearchMicroUsdPerDay)}`} />
      <Meter tone="ai" label="Illustrations" value={t.images} cap={settings.maxImagesPerDay} display={`${t.images} / ${settings.maxImagesPerDay}`} />
      <Meter tone="ai" label="Image spend" value={t.imageMicroUsd} cap={settings.maxImageMicroUsdPerDay} display={`${usd(t.imageMicroUsd)} / ${usd(settings.maxImageMicroUsdPerDay)}`} />
    </div>
  );
}

function DeskState({ settings }: Readonly<{ settings: NewsDeskSettingsView | null }>) {
  if (!settings) return null;
  if (!settings.deskEnabled) return <FlagChip tone="clay">Desk switched off</FlagChip>;
  if (!settings.longformEnabled) return <FlagChip tone="neutral">Long-form reports off</FlagChip>;
  if (!settings.keys.anthropic) return <FlagChip tone="clay">No Anthropic key</FlagChip>;
  return <FlagChip tone="green">Drafting</FlagChip>;
}

export function Component() {
  const { page, settings, status } = useLoaderData() as Data;
  const [, setParams] = useSearchParams();
  const navigation = useNavigation();
  const loading = navigation.state === "loading" && navigation.location?.pathname === "/newsroom/research";
  const totalPages = Math.max(1, Math.ceil(page.total / Math.max(1, page.perPage)));

  const go = (next: { status?: string; page?: number }) => {
    const p = new URLSearchParams();
    const s = next.status ?? status;
    if (s !== DEFAULT_STATUS) p.set("status", s);
    if ((next.page ?? 1) > 1) p.set("page", String(next.page));
    setParams(p);
  };

  return (
    <>
      <PageHeader
        kicker="Newsroom · AI desk"
        title="Research queue"
        lede="Reports the desk drafted from feed briefs. Each one waits here until an editor checks it against its sources and approves it."
      >
        <Link to="/newsroom/desk" className="text-sm font-semibold text-green-text underline-offset-4 transition-colors hover:underline">Desk settings</Link>
      </PageHeader>

      <section aria-labelledby="spend-title" className="mb-6 rounded-[var(--radius-card)] border border-ai-line bg-ai-tint/60 p-5 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 id="spend-title" className="text-sm font-semibold text-ink">Today's spend against the caps <span className="font-normal text-ink-faint">(Accra day)</span></h2>
          <DeskState settings={settings} />
        </div>
        <SpendStrip page={page} settings={settings} />
      </section>

      <nav aria-label="Filter by status" className="mb-4">
        <div className="flex flex-wrap gap-1 rounded-[1.4rem] border border-sand bg-paper p-1 sm:inline-flex">
          {JOB_STATUS_ORDER.map((s) => (
            <button key={s} type="button" aria-pressed={status === s} onClick={() => go({ status: s })} className={segmentCls(status === s)}>
              {JOB_STATUS_LABEL[s]}
            </button>
          ))}
          <button type="button" aria-pressed={status === ALL} onClick={() => go({ status: ALL })} className={segmentCls(status === ALL)}>All</button>
        </div>
      </nav>

      {page.items.length === 0 && !loading ? (
        <Empty icon="search" title={status === DEFAULT_STATUS ? "Nothing waiting for review" : "No jobs with this status"}>
          {status === DEFAULT_STATUS
            ? "When the desk finishes a report it lands here. Briefs keep publishing as usual in the meantime."
            : "Try another status, or All to see every job."}
        </Empty>
      ) : (
        <Card className="overflow-x-auto shadow-[var(--shadow-card)]">
          <table className="w-full min-w-[56rem] text-sm">
            <caption className="sr-only">Research jobs, {JOB_STATUS_LABEL[status as ResearchJobStatus] ?? "all statuses"}</caption>
            <thead>
              <tr className={tableHeadCls}>
                <th scope="col" className="px-4 py-3">Lead</th>
                <th scope="col" className="px-4 py-3">Source</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3">Flags</th>
                <th scope="col" className="px-4 py-3 text-right">Cost</th>
                <th scope="col" className="px-4 py-3">Created</th>
              </tr>
            </thead>
            {loading ? <TableRowsSkeleton rows={6} columns={6} label="Loading research jobs" /> : (
              <tbody className="divide-y divide-sand">
                {page.items.map((job) => (
                  <tr key={job.id} className="align-top transition-colors hover:bg-paper">
                    <td className="max-w-[26rem] px-4 py-3">
                      <Link to={`/newsroom/${job.articleId}`} className="font-semibold leading-snug text-ink underline-offset-4 transition-colors hover:text-green-text hover:underline [text-wrap:pretty]">
                        {job.draft?.title || job.leadTitle}
                      </Link>
                      {job.draft?.title && job.draft.title !== job.leadTitle && <p className="mt-0.5 line-clamp-1 text-xs text-ink-faint">Lead: {job.leadTitle}</p>}
                      {job.lastError && job.status === "failed" && <p className="mt-0.5 line-clamp-2 text-xs text-clay-text">{job.lastError}</p>}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{job.leadSource}</td>
                    <td className="px-4 py-3"><ToneChip tone={JOB_STATUS_TONE[job.status]}>{JOB_STATUS_LABEL[job.status]}</ToneChip></td>
                    <td className="px-4 py-3">
                      <div className="flex max-w-[16rem] flex-wrap gap-1">
                        {(job.draft?.flags ?? []).map((f) => <FlagChip key={f} tone={f === "political" ? "clay" : "gold"}>{draftFlagLabel(f)}</FlagChip>)}
                        {job.draft?.cover.kind === "ai" && <FlagChip tone="ai">AI illustration</FlagChip>}
                        {job.attempts > 1 && <FlagChip tone="neutral">{count(job.attempts)} attempts</FlagChip>}
                        {!job.draft?.flags?.length && job.draft?.cover.kind !== "ai" && job.attempts <= 1 && <span className="text-ink-faint">—</span>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums text-ink">{usd(jobCost(job))}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-ink-faint">{formatDateTime(job.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </Card>
      )}

      <Pagination page={page.page} totalPages={totalPages} onChange={(p) => go({ page: p })} total={page.total} pageSize={page.perPage} disabled={loading} />
    </>
  );
}
