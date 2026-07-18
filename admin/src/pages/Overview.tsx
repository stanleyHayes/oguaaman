import { useEffect, type ReactNode } from "react";
import { Link, useLoaderData, useRevalidator } from "react-router-dom";
import { api } from "@/lib/api";
import type { Stats, Listing, ListingType, Member, Organization } from "@/lib/types";
import { Card, StatusBadge } from "@/components/ui";
import { MetricCard } from "@/components/metric-card";
import { BarsH, Histogram, AreaLine, Donut, CHART_COLORS, type Datum } from "@/components/charts";
import { Stagger, StaggerItem } from "@/components/motion";
import { useAuth } from "@/lib/auth";
import { BusyLabel } from "@/components/skeleton";
import {
  ArrowUpRight, BadgeCheck, Camera, CheckCircle2, Clock, Eye, GraduationCap, Heart,
  Inbox, Landmark, ListChecks, Newspaper, Palette, Sparkles, UserPlus, Users,
  type LucideIcon,
} from "lucide-react";

interface Data {
  stats: Stats;
  queue: Listing[];
  listings: Listing[];
  members: Member[];
  institutions: Organization[];
}

export async function loader(): Promise<Data> {
  const [stats, queue, listings, members, institutions] = await Promise.all([
    api.stats(),
    api.queue(),
    api.listings().catch(() => [] as Listing[]),
    api.members().catch(() => [] as Member[]),
    api.institutions().catch(() => [] as Organization[]),
  ]);
  return { stats, queue, listings, members, institutions };
}

// ── analytics helpers ────────────────────────────────────────────────────────
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Count ISO dates into a continuous run of month buckets (min→max present). */
function monthlyCounts(dates: (string | undefined)[]): { key: string; label: string; value: number }[] {
  const keys = dates.filter((d): d is string => !!d).map((d) => d.slice(0, 7)).filter((s) => /^\d{4}-\d{2}$/.test(s)).sort((a, b) => a.localeCompare(b));
  if (!keys.length) return [];
  const tally: Record<string, number> = {};
  keys.forEach((k) => (tally[k] = (tally[k] ?? 0) + 1));
  const [sy, sm] = keys[0].split("-").map(Number);
  const [ey, em] = keys.at(-1)!.split("-").map(Number);
  const out: { key: string; label: string; value: number }[] = [];
  let y = sy, m = sm, guard = 0;
  while ((y < ey || (y === ey && m <= em)) && guard++ < 60) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    out.push({ key, label: MON[m - 1], value: tally[key] ?? 0 });
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

function countBy<T>(items: T[], pick: (t: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, it) => {
    const k = pick(it);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
}

const TYPE_LABEL: Record<ListingType, string> = {
  business: "Businesses", artist: "Artists", person: "People", memory: "Memories",
  event: "Events", opportunity: "Opportunities", memorial: "Memorials",
  project: "Projects", incident: "Incidents", lostfound: "Lost & found",
};
const KIND_LABEL: Record<string, string> = {
  school: "Schools", "traditional-authority": "Traditional", association: "Associations",
  faith: "Faith", civic: "Civic", business: "Businesses", asafo: "Asafo",
  heritage: "Heritage", "emergency-service": "Emergency services",
  "security-service": "Security services", "health-service": "Health services",
  "local-government": "Local government",
};
const STATUS_COLOR: Record<string, string> = {
  approved: "var(--color-teal)", pending: "var(--color-gold-brand)", rejected: "var(--color-clay-text)",
  unpublished: "var(--color-ink-faint)", draft: "var(--color-green-slate)",
};

function humanizeKind(kind: string): string {
  return kind
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// ── small presentational pieces ──────────────────────────────────────────────
function ChartCard({ title, hint, children, className = "", bodyClassName = "" }: Readonly<{
  title: string;
  hint?: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}>) {
  return (
    <Card className={`flex h-full min-w-0 flex-col overflow-hidden shadow-[var(--shadow-card)] ${className}`}>
      <div className="flex min-h-14 items-center justify-between gap-3 border-b border-sand px-5 py-3.5">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {hint && <span className="shrink-0 rounded-full bg-paper px-2.5 py-1 text-[0.68rem] font-semibold text-ink-faint">{hint}</span>}
      </div>
      <div className={`min-h-0 flex-1 p-5 ${bodyClassName}`}>{children}</div>
    </Card>
  );
}

interface QuickAction {
  to: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  tone: string;
}

const QUICK: QuickAction[] = [
  { to: "/moderation", label: "Review the queue", desc: "Approve, request changes, reject", icon: BadgeCheck, tone: "bg-gold/15 text-gold-text" },
  { to: "/newsroom", label: "Write an article", desc: "Publish news to the site", icon: Newspaper, tone: "bg-green/[0.09] text-green-text" },
  { to: "/members", label: "Invite a teammate", desc: "Editors, curators, stewards", icon: UserPlus, tone: "bg-teal/[0.1] text-teal-text" },
  { to: "/compose", label: "Compose with AI", desc: "Draft and polish copy", icon: Sparkles, tone: "bg-ai/[0.09] text-ai" },
];

const REFRESH_MS = 15_000;

export function Component() {
  const { stats, queue, listings, members, institutions } = useLoaderData() as Data;
  const { member } = useAuth();
  const revalidator = useRevalidator();

  // Live dashboard: silently re-run the loader on an interval so the figures and
  // graphs stay current while the tab is open.
  // Depend on the stable `revalidate` callback (memoized by react-router), not
  // the whole revalidator object — whose identity flips on each idle→loading→idle
  // cycle and would otherwise reset the interval on every refresh.
  const { revalidate } = revalidator;
  useEffect(() => {
    const id = setInterval(() => revalidate(), REFRESH_MS);
    return () => clearInterval(id);
  }, [revalidate]);

  // ── derived analytics ──
  const growth = (() => {
    const monthly = monthlyCounts(members.map((m) => m.joinedAt));
    // Pure running total — no reassignment during render (eslint react-hooks/immutability).
    return monthly.map((b, i) => ({
      label: b.label,
      value: monthly.slice(0, i + 1).reduce((s, x) => s + x.value, 0),
    }));
  })();
  const submissions: Datum[] = monthlyCounts(listings.map((l) => l.submittedAt ?? l.createdAt))
    .map((b) => ({ label: b.label, value: b.value }));

  const typeCounts = countBy(listings, (l) => l.type);
  const contentMix: Datum[] = Object.entries(TYPE_LABEL)
    .map(([k, label]) => ({ label, value: typeCounts[k] ?? 0 }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);

  const statusCounts = countBy(listings, (l) => l.status);
  const statusMix: Datum[] = ["approved", "pending", "rejected", "unpublished", "draft"]
    .map((s) => ({ label: s[0].toUpperCase() + s.slice(1), value: statusCounts[s] ?? 0, color: STATUS_COLOR[s] }))
    .filter((d) => d.value > 0);

  const kindCounts = countBy(institutions, (o) => o.kind);
  const institutionMix: Datum[] = Object.entries(kindCounts)
    .map(([k, v], i) => ({ label: KIND_LABEL[k] ?? humanizeKind(k), value: v, color: CHART_COLORS[i % CHART_COLORS.length] }))
    .sort((a, b) => b.value - a.value);

  const verified = institutions.filter((o) => o.verified).length;
  const verifyMix: Datum[] = [
    { label: "Verified", value: verified, color: "var(--color-teal)" },
    { label: "Unverified", value: institutions.length - verified, color: "var(--color-sand)" },
  ].filter((d) => d.value > 0);
  const institutionPivot = Math.ceil(institutionMix.length / 2);
  const institutionColumns = [
    institutionMix.slice(0, institutionPivot),
    institutionMix.slice(institutionPivot),
  ].filter((column) => column.length > 0);
  const verifiedPercent = institutions.length > 0 ? Math.round((verified / institutions.length) * 100) : 0;

  return (
    <>
      <section className="relative mb-4 overflow-hidden rounded-[1.35rem] bg-green-900 px-5 py-5 text-on-green shadow-[var(--shadow-card)] sm:px-7 sm:py-6">
        <span aria-hidden className="pointer-events-none absolute -right-7 -top-12 select-none font-display text-[11rem] font-semibold leading-none text-on-green/[0.035]">O</span>
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-2xl">
            <p className="text-[0.62rem] font-bold uppercase tracking-[0.18em] text-gold">Back office · live town pulse</p>
            <h1 className="mt-1.5 text-3xl font-semibold text-on-green sm:text-[2rem]">
            Welcome{member ? `, ${member.displayName.split(" ")[0]}` : ""}.
            </h1>
            <p className="mt-1.5 text-sm text-on-green/70">
              {stats.pending > 0
                ? <>There {stats.pending === 1 ? "is" : "are"} <Link to="/moderation" className="font-semibold text-gold hover:text-gold/80">{stats.pending} item{stats.pending === 1 ? "" : "s"}</Link> waiting for a decision.</>
                : "The moderation queue is clear. The town is in good order."}
            </p>
          </div>
          <button type="button"
            onClick={() => revalidator.revalidate()}
            className="inline-flex items-center gap-2 rounded-full border border-on-green/15 bg-on-green/[0.07] px-3.5 py-2 text-xs font-semibold text-on-green transition-colors hover:bg-on-green/[0.12]"
            title={`Auto-refreshes every ${REFRESH_MS / 1000}s`}
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-teal" />
            </span>
            {revalidator.state === "loading" ? <BusyLabel label="Syncing dashboard" tone="gold" /> : "Live · refresh"}
          </button>
        </div>
      </section>

      {/* Metrics: 10 cards → always a regular grid (2×5 or 5×2) */}
      <Stagger className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <StaggerItem index={0}><MetricCard label="Pending" value={stats.pending} to="/moderation" tone="gold" icon={<Inbox size={18} />} /></StaggerItem>
        <StaggerItem index={1}><MetricCard label="Live listings" value={stats.listings} to="/listings" tone="green" icon={<ListChecks size={18} />} /></StaggerItem>
        <StaggerItem index={2}><MetricCard label="Members" value={stats.members} to="/members" tone="teal" icon={<Users size={18} />} /></StaggerItem>
        <StaggerItem index={3}><MetricCard label="Institutions" value={stats.institutions} to="/institutions" tone="ink" icon={<Landmark size={18} />} /></StaggerItem>
        <StaggerItem index={4}><MetricCard label="Artists" value={stats.artists} to="/listings" tone="clay" icon={<Palette size={18} />} /></StaggerItem>
        <StaggerItem index={5}><MetricCard label="Memorials" value={stats.memorials} to="/listings" tone="gold" icon={<Heart size={18} />} /></StaggerItem>
        <StaggerItem index={6}><MetricCard label="Memories" value={stats.memories} to="/listings" tone="ink" icon={<Camera size={18} />} /></StaggerItem>
        <StaggerItem index={7}><MetricCard label="Schools" value={stats.schools} to="/institutions" tone="maroon" icon={<GraduationCap size={18} />} /></StaggerItem>
        <StaggerItem index={8}><MetricCard label="Views this month" value={stats.viewsThisMonth} tone="teal" icon={<Eye size={18} />} sub="Unique daily views" /></StaggerItem>
        <StaggerItem index={9}><MetricCard label="Avg approval" value={stats.avgApprovalHrs > 0 ? `${stats.avgApprovalHrs.toFixed(1)}h` : "—"} tone="gold" icon={<Clock size={18} />} sub="Submission → decision (90d)" /></StaggerItem>
      </Stagger>

      {/* Each desktop band is internally balanced; tall categorical data gets a
          dedicated wide row instead of forcing empty space below short charts. */}
      <Stagger className="mt-4 grid gap-4 lg:grid-cols-12 lg:items-stretch">
        <StaggerItem index={0} className="min-w-0 lg:col-span-7">
          <ChartCard title="Community growth" hint="Cumulative members">
            <AreaLine points={growth} className="h-44 sm:h-48" />
          </ChartCard>
        </StaggerItem>
        <StaggerItem index={1} className="min-w-0 lg:col-span-5">
          <ChartCard title="Listing status" hint={`${stats.listings} live`}>
            <Donut data={statusMix} label="listings" className="h-44 justify-center sm:h-48" />
          </ChartCard>
        </StaggerItem>

        <StaggerItem index={2} className="min-w-0 lg:col-span-5">
          <ChartCard title="Submissions" hint="Per month">
            <Histogram data={submissions} className="min-h-52" />
          </ChartCard>
        </StaggerItem>
        <StaggerItem index={3} className="min-w-0 lg:col-span-7">
          <ChartCard title="Content mix" hint="By type">
            <BarsH data={contentMix} className="py-1" />
          </ChartCard>
        </StaggerItem>

        <StaggerItem index={4} className="min-w-0 lg:col-span-12">
          <ChartCard title="Institutions" hint={`${verified}/${institutions.length} verified`}>
            {institutionMix.length ? (
              <div className="grid items-center gap-5 xl:grid-cols-[minmax(0,1fr)_17rem]">
                <div className={`grid min-w-0 gap-x-7 gap-y-2 ${institutionColumns.length > 1 ? "sm:grid-cols-2" : ""}`}>
                  {institutionColumns.map((column) => (
                    <BarsH key={column.map((item) => item.label).join("-")} data={column} />
                  ))}
                </div>
                <div className="border-t border-sand pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
                  <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-ink-faint">Verification coverage</p>
                  <Donut data={verifyMix} label="total" className="mt-3 justify-center xl:justify-start" />
                  <p className="mt-3 text-xs leading-relaxed text-ink-muted">
                    <span className="font-semibold text-teal-text">{verifiedPercent}% verified.</span>{" "}
                    {institutions.length === verified ? "Every institution is current." : `${institutions.length - verified} still need${institutions.length - verified === 1 ? "s" : ""} review.`}
                  </p>
                </div>
              </div>
            ) : <BarsH data={institutionMix} />}
          </ChartCard>
        </StaggerItem>

        <StaggerItem index={5} className="min-w-0 lg:col-span-7">
          <Card className="flex h-full min-w-0 flex-col overflow-hidden shadow-[var(--shadow-card)]">
            <div className="flex min-h-14 items-center justify-between gap-3 border-b border-sand px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-semibold">Needs attention</h2>
                <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[0.68rem] font-bold text-gold-text">{queue.length}</span>
              </div>
              <Link to="/moderation" className="inline-flex items-center gap-1 text-xs font-semibold text-gold-text hover:text-gold-text/75">
                Open queue <ArrowUpRight size={13} aria-hidden />
              </Link>
            </div>
            {queue.length === 0 ? (
              <div className="flex min-h-64 flex-1 flex-col items-center justify-center px-5 py-8 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-teal/[0.1] text-teal-text"><CheckCircle2 size={23} aria-hidden /></span>
                <p className="mt-3 font-semibold text-ink">The queue is clear</p>
                <p className="mt-1 max-w-xs text-sm text-ink-muted">New submissions will appear here as soon as they need a steward.</p>
              </div>
            ) : (
              <ul className="divide-y divide-sand">
                {queue.slice(0, 6).map((l) => (
                  <li key={l.id}>
                    <Link to={`/listings/${l.id}`} className="group flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-paper">
                      <span className="flex min-w-0 flex-1 items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gold/[0.12] text-sm font-bold uppercase text-gold-text">{l.type.slice(0, 1)}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-ink">{l.title}</span>
                          <span className="block text-[0.68rem] capitalize text-ink-faint">{l.type}</span>
                        </span>
                      </span>
                      <StatusBadge status={l.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </StaggerItem>

        <StaggerItem index={6} className="min-w-0 lg:col-span-5">
          <ChartCard title="Quick actions" hint="Common tasks" bodyClassName="grid grid-cols-2 gap-3">
              {QUICK.map((q) => (
                <Link key={q.to} to={q.to} className="group flex min-h-28 flex-col justify-between rounded-2xl border border-sand bg-paper p-3.5 transition-[border-color,transform,box-shadow] hover:-translate-y-0.5 hover:border-gold-border/50 hover:shadow-sm">
                  <span className="flex items-start justify-between gap-2">
                    <span className={`grid h-9 w-9 place-items-center rounded-xl ${q.tone}`}><q.icon size={17} aria-hidden /></span>
                    <ArrowUpRight size={14} className="text-ink-faint transition-colors group-hover:text-gold-text" aria-hidden />
                  </span>
                  <span className="mt-4">
                    <span className="block text-sm font-semibold leading-tight text-ink">{q.label}</span>
                    <span className="mt-1 block text-[0.68rem] leading-snug text-ink-faint">{q.desc}</span>
                  </span>
                </Link>
              ))}
          </ChartCard>
        </StaggerItem>
      </Stagger>
    </>
  );
}
