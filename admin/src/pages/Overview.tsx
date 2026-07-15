import { useEffect, type ReactNode } from "react";
import { Link, useLoaderData, useRevalidator } from "react-router-dom";
import { api } from "@/lib/api";
import type { Stats, Listing, Member, Organization } from "@/lib/types";
import { Card, StatusBadge } from "@/components/ui";
import { BarsH, Histogram, AreaLine, Donut, CHART_COLORS, type Datum } from "@/components/charts";
import { Stagger, StaggerItem } from "@/components/motion";
import { useAuth } from "@/lib/auth";

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

const TYPE_LABEL: Record<string, string> = {
  business: "Businesses", artist: "Artists", person: "People", memory: "Memories",
  event: "Events", opportunity: "Opportunities", memorial: "Memorials",
};
const KIND_LABEL: Record<string, string> = {
  school: "Schools", "traditional-authority": "Traditional", association: "Associations",
  faith: "Faith", civic: "Civic", business: "Business", asafo: "Asafo",
};
const STATUS_COLOR: Record<string, string> = {
  approved: "#0e7c6b", pending: "#b07d32", rejected: "#9a4030", unpublished: "#6e7a70", draft: "#3b473d",
};

// ── small presentational pieces ──────────────────────────────────────────────
interface Tile { label: string; value: number; to: string; tone?: string; accent?: boolean }
function StatTile({ label, value, to, tone = "text-ink", accent = false }: Readonly<Tile>) {
  return (
    <Link
      to={to}
      // `block` is required: an inline <a> wrapping block divs fragments its
      // box, collapsing the border/background into a thin strip.
      className={`group block rounded-[var(--radius-card)] border p-4 transition-colors ${
        accent ? "border-gold-border/50 bg-gold/[0.08] hover:bg-gold/[0.14]" : "border-sand bg-cream hover:border-gold-border/50"
      }`}
    >
      <div className={`text-3xl font-semibold ${tone}`}>{value}</div>
      <div className="mt-1 flex items-center justify-between text-xs uppercase tracking-wide text-ink-faint">
        {label}
        <span className="opacity-0 transition-opacity group-hover:opacity-100">→</span>
      </div>
    </Link>
  );
}

function ChartCard({ title, hint, children }: Readonly<{ title: string; hint?: string; children: ReactNode }>) {
  return (
    <Card className="h-full min-w-0 p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {hint && <span className="text-xs text-ink-faint">{hint}</span>}
      </div>
      {children}
    </Card>
  );
}

const QUICK = [
  { to: "/moderation", label: "Review the queue", desc: "Approve, request changes, reject" },
  { to: "/newsroom", label: "Write an article", desc: "Publish news to the site" },
  { to: "/members", label: "Invite a teammate", desc: "Editors, curators, stewards" },
  { to: "/compose", label: "Compose with AI", desc: "Draft & polish copy" },
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
    .map(([k, v], i) => ({ label: KIND_LABEL[k] ?? k, value: v, color: CHART_COLORS[i % CHART_COLORS.length] }))
    .sort((a, b) => b.value - a.value);

  const verified = institutions.filter((o) => o.verified).length;
  const verifyMix: Datum[] = [
    { label: "Verified", value: verified, color: "#0e7c6b" },
    { label: "Unverified", value: institutions.length - verified, color: "#ece4d3" },
  ].filter((d) => d.value > 0);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-gold-text">Back office · analytics</p>
          <h1 className="mt-1 text-3xl font-semibold text-ink">
            Welcome{member ? `, ${member.displayName.split(" ")[0]}` : ""}.
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {stats.pending > 0
              ? <>You have <Link to="/moderation" className="font-semibold text-gold-text hover:underline">{stats.pending} item{stats.pending === 1 ? "" : "s"}</Link> waiting in the queue.</>
              : "The moderation queue is clear. The town is in good order."}
          </p>
        </div>
        <button
          onClick={() => revalidator.revalidate()}
          className="inline-flex items-center gap-2 rounded-full border border-sand bg-cream px-3 py-1.5 text-xs font-semibold text-ink-muted transition-colors hover:border-gold-border/50"
          title={`Auto-refreshes every ${REFRESH_MS / 1000}s`}
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-teal" />
          </span>
          {revalidator.state === "loading" ? "Syncing…" : "Live"}
        </button>
      </div>

      <Stagger className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StaggerItem index={0}><StatTile label="Pending" value={stats.pending} to="/moderation" tone="text-gold-text" accent /></StaggerItem>
        <StaggerItem index={1}><StatTile label="Live listings" value={stats.listings} to="/listings" /></StaggerItem>
        <StaggerItem index={2}><StatTile label="Members" value={stats.members} to="/members" /></StaggerItem>
        <StaggerItem index={3}><StatTile label="Institutions" value={stats.institutions} to="/institutions" /></StaggerItem>
        <StaggerItem index={4}><StatTile label="Artists" value={stats.artists} to="/listings" tone="text-clay-text" /></StaggerItem>
        <StaggerItem index={5}><StatTile label="Memorials" value={stats.memorials} to="/listings" tone="text-gold-text" /></StaggerItem>
        <StaggerItem index={6}><StatTile label="Memories" value={stats.memories} to="/listings" /></StaggerItem>
        <StaggerItem index={7}><StatTile label="Schools" value={stats.schools} to="/institutions" tone="text-maroon-900" /></StaggerItem>
      </Stagger>

      <Stagger className="mt-5 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <StaggerItem index={0} className="min-w-0">
          <ChartCard title="Community growth" hint="Cumulative members">
            <AreaLine points={growth} />
          </ChartCard>
        </StaggerItem>
        <StaggerItem index={1} className="min-w-0">
          <ChartCard title="Listing status" hint={`${stats.listings} live`}>
            <Donut data={statusMix} label="listings" />
          </ChartCard>
        </StaggerItem>
      </Stagger>

      <Stagger className="mt-5 grid gap-5 lg:grid-cols-3">
        <StaggerItem index={0} className="min-w-0">
          <ChartCard title="Submissions" hint="Per month">
            <Histogram data={submissions} />
          </ChartCard>
        </StaggerItem>
        <StaggerItem index={1} className="min-w-0">
          <ChartCard title="Content mix" hint="By type">
            <BarsH data={contentMix} />
          </ChartCard>
        </StaggerItem>
        <StaggerItem index={2} className="min-w-0">
          <ChartCard title="Institutions" hint={`${verified}/${institutions.length} verified`}>
            {institutionMix.length ? (
              <div className="space-y-4">
                <BarsH data={institutionMix} />
                <div className="border-t border-sand pt-3"><Donut data={verifyMix} label="total" /></div>
              </div>
            ) : <BarsH data={institutionMix} />}
          </ChartCard>
        </StaggerItem>
      </Stagger>

      <Stagger className="mt-5 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <StaggerItem index={0} className="min-w-0">
          <Card className="h-full min-w-0 overflow-hidden">
            <div className="flex items-center justify-between border-b border-sand px-5 py-3">
              <h2 className="text-lg font-semibold">Needs attention</h2>
              <Link to="/moderation" className="text-sm font-semibold text-gold-text hover:underline">Open queue →</Link>
            </div>
            {queue.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-ink-muted">Queue is clear. 🦀</p>
            ) : (
              <ul>
                {queue.slice(0, 6).map((l) => (
                  <li key={l.id} className="border-b border-sand last:border-0">
                    <Link to={`/listings/${l.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-paper">
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-medium text-ink">{l.title}</span>
                        <span className="ml-2 text-xs capitalize text-ink-faint">{l.type}</span>
                      </span>
                      <StatusBadge status={l.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </StaggerItem>

        <StaggerItem index={1} className="min-w-0">
          <Card className="h-full min-w-0 p-5">
            <h2 className="mb-3 text-lg font-semibold">Quick actions</h2>
            <div className="space-y-2">
              {QUICK.map((q) => (
                <Link key={q.to} to={q.to} className="group flex items-center justify-between gap-3 rounded-lg border border-sand px-3.5 py-2.5 transition-colors hover:border-gold-border/50 hover:bg-paper">
                  <span>
                    <span className="block text-sm font-medium text-ink">{q.label}</span>
                    <span className="block text-xs text-ink-faint">{q.desc}</span>
                  </span>
                  <span className="text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-gold-text">→</span>
                </Link>
              ))}
            </div>
          </Card>
        </StaggerItem>
      </Stagger>
    </>
  );
}
