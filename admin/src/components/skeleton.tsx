import type { CSSProperties, ReactNode } from "react";

type SkeletonTone = "surface" | "dark" | "gold";

/** One theme-aware placeholder shape. Keep meaningful loading copy in BusyLabel/SkeletonGroup. */
export function Skeleton({
  className = "",
  tone = "surface",
  style,
}: Readonly<{
  className?: string;
  tone?: SkeletonTone;
  style?: CSSProperties;
}>) {
  const toneClass = tone === "dark" ? "oguaa-skeleton--dark" : tone === "gold" ? "oguaa-skeleton--gold" : "";
  return <span aria-hidden className={`oguaa-skeleton block rounded-lg ${toneClass} ${className}`} style={style} />;
}

/** Accessible wrapper for a group of decorative skeleton shapes. */
export function SkeletonGroup({
  children,
  label = "Loading content",
  className = "",
}: Readonly<{
  children: ReactNode;
  label?: string;
  className?: string;
}>) {
  return (
    <div className={className} role="status" aria-live="polite" aria-busy="true" aria-label={label}>
      <span className="sr-only">{label}</span>
      <div aria-hidden>{children}</div>
    </div>
  );
}

/** Compact, shape-stable pending state for buttons and row actions. */
export function BusyLabel({
  label,
  className = "",
  width = "w-16",
  tone = "surface",
}: Readonly<{
  label: string;
  className?: string;
  width?: "w-10" | "w-12" | "w-14" | "w-16" | "w-20" | "w-24";
  tone?: SkeletonTone;
}>) {
  return (
    <span className={`inline-flex min-h-4 items-center gap-2 ${className}`} role="status" aria-live="polite" aria-label={label}>
      <span className="sr-only">{label}</span>
      <Skeleton tone={tone} className="size-2.5 shrink-0 rounded-full" />
      <Skeleton tone={tone} className={`h-2.5 ${width} rounded-full`} />
    </span>
  );
}

const CELL_WIDTHS = ["w-24", "w-16", "w-20", "w-12", "w-28", "w-14", "w-20", "w-16"] as const;

/** Shape-preserving tbody used while a table or ledger refreshes in place. */
export function TableRowsSkeleton({
  rows = 5,
  columns = 6,
  label = "Loading table rows",
}: Readonly<{
  rows?: number;
  columns?: number;
  label?: string;
}>) {
  return (
    <tbody aria-busy="true" aria-label={label} className="divide-y divide-sand">
      {Array.from({ length: rows }, (_, row) => (
        <tr key={`skeleton-row-${row}`}>
          {Array.from({ length: columns }, (_, column) => (
            <td key={`skeleton-cell-${row}-${column}`} className="px-4 py-4">
              {row === 0 && column === 0 && <span className="sr-only">{label}</span>}
              <Skeleton className={`h-3 ${CELL_WIDTHS[column % CELL_WIDTHS.length]} max-w-full rounded-full`} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

export type PageSkeletonVariant = "dashboard" | "table" | "collection" | "detail" | "editor";

function pageSkeletonVariant(pathname: string): PageSkeletonVariant {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return "dashboard";
  if (/^\/(listings|members|institutions)\/[^/]+$/.test(path)) return "detail";
  if (/^\/newsroom\/[^/]+$/.test(path) || ["/profile", "/settings", "/compose"].includes(path)) return "editor";
  if (["/listings", "/members", "/tickets", "/subscriptions", "/plans", "/revenue", "/audit"].includes(path)) return "table";
  return "collection";
}

function PageHeadingSkeleton({ action = false }: Readonly<{ action?: boolean }>) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div className="space-y-2">
        <Skeleton className="h-2.5 w-24 rounded-full" />
        <Skeleton className="h-9 w-56 max-w-[70vw]" />
      </div>
      {action && <Skeleton className="h-9 w-28 rounded-full" />}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <div className="mb-4 overflow-hidden rounded-[var(--radius-card)] border border-green/15 bg-green-900 p-6">
        <Skeleton tone="dark" className="h-2.5 w-32 rounded-full" />
        <Skeleton tone="dark" className="mt-4 h-9 w-64 max-w-full" />
        <Skeleton tone="dark" className="mt-3 h-3 w-80 max-w-full rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        {Array.from({ length: 10 }, (_, index) => (
          <div key={`metric-${index}`} className="rounded-[var(--radius-card)] border border-sand bg-cream p-4 shadow-[var(--shadow-card)]">
            <Skeleton className="h-2.5 w-20 rounded-full" />
            <Skeleton className="mt-5 h-8 w-14" />
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <div key={`chart-${index}`} className="rounded-[var(--radius-card)] border border-sand bg-cream p-5 shadow-[var(--shadow-card)]">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="mt-8 h-44 w-full" />
          </div>
        ))}
      </div>
    </>
  );
}

function TablePageSkeleton() {
  return (
    <>
      <PageHeadingSkeleton action />
      <div className="mb-4 flex flex-wrap gap-3">
        <Skeleton className="h-10 w-52 rounded-full" />
        <Skeleton className="h-10 w-32 rounded-full" />
        <Skeleton className="h-10 w-28 rounded-full" />
      </div>
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)]">
        <table className="w-full min-w-[42rem] text-sm">
          <thead><tr className="border-b border-sand">{Array.from({ length: 6 }, (_, i) => <th key={i} className="px-4 py-4"><Skeleton className="h-2.5 w-16 rounded-full" /></th>)}</tr></thead>
          <TableRowsSkeleton />
        </table>
      </div>
    </>
  );
}

function CollectionPageSkeleton() {
  return (
    <>
      <PageHeadingSkeleton action />
      <Skeleton className="mb-6 h-3 w-[32rem] max-w-full rounded-full" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={`collection-${index}`} className="rounded-[var(--radius-card)] border border-sand bg-cream p-5 shadow-[var(--shadow-card)]">
            <div className="flex items-start gap-3">
              <Skeleton className="size-11 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4 w-3/4 rounded-full" />
                <Skeleton className="mt-2 h-2.5 w-1/2 rounded-full" />
              </div>
            </div>
            <Skeleton className="mt-5 h-3 w-full rounded-full" />
            <Skeleton className="mt-2 h-3 w-4/5 rounded-full" />
            <div className="mt-5 flex gap-2 border-t border-sand pt-4">
              <Skeleton className="h-8 w-20 rounded-full" />
              <Skeleton className="h-8 w-16 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function DetailPageSkeleton() {
  return (
    <>
      <Skeleton className="mb-4 h-3 w-24 rounded-full" />
      <div className="rounded-[var(--radius-card)] border border-sand bg-cream p-6 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 shrink-0 rounded-full" />
          <div className="flex-1"><Skeleton className="h-8 w-64 max-w-full" /><Skeleton className="mt-3 h-3 w-44 rounded-full" /></div>
        </div>
        <Skeleton className="mt-6 h-3 w-full rounded-full" />
        <Skeleton className="mt-2 h-3 w-3/4 rounded-full" />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-5">{Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-44 w-full rounded-[var(--radius-card)]" />)}</div>
        <Skeleton className="h-[23rem] w-full rounded-[var(--radius-card)]" />
      </div>
    </>
  );
}

function EditorPageSkeleton() {
  return (
    <>
      <PageHeadingSkeleton action />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-4 rounded-[var(--radius-card)] border border-sand bg-cream p-5 shadow-[var(--shadow-card)]">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
        <div className="space-y-4"><Skeleton className="h-48 w-full rounded-[var(--radius-card)]" /><Skeleton className="h-36 w-full rounded-[var(--radius-card)]" /></div>
      </div>
    </>
  );
}

/** Destination-aware route placeholder used for both cold boot and navigation. */
export function PageSkeleton({ pathname, variant }: Readonly<{ pathname?: string; variant?: PageSkeletonVariant }>) {
  const resolved = variant ?? pageSkeletonVariant(pathname ?? "/");
  return (
    <SkeletonGroup label="Loading page">
      {resolved === "dashboard" && <DashboardSkeleton />}
      {resolved === "table" && <TablePageSkeleton />}
      {resolved === "collection" && <CollectionPageSkeleton />}
      {resolved === "detail" && <DetailPageSkeleton />}
      {resolved === "editor" && <EditorPageSkeleton />}
    </SkeletonGroup>
  );
}

/** Cold-start shell shown while React Router resolves its first lazy route and loader. */
export function AppShellSkeleton({ pathname = "/" }: Readonly<{ pathname?: string }>) {
  return (
    <div className="min-h-screen bg-paper" aria-busy="true">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-navy-soft bg-navy p-5 lg:block">
        <Skeleton tone="gold" className="h-9 w-32" />
        <div className="mt-10 space-y-5">
          {Array.from({ length: 7 }, (_, group) => (
            <div key={`nav-group-${group}`}>
              <Skeleton tone="dark" className="h-2.5 w-20 rounded-full" />
              <Skeleton tone="dark" className="mt-2 h-9 w-full rounded-xl" />
            </div>
          ))}
        </div>
      </aside>
      <div className="flex min-h-screen flex-col lg:pl-60">
        <header className="flex h-16 items-center gap-4 border-b border-sand bg-cream/90 px-4 sm:px-6">
          <Skeleton className="size-10 rounded-xl" />
          <div><Skeleton className="h-4 w-36 rounded-full" /><Skeleton className="mt-2 h-2 w-24 rounded-full" /></div>
          <Skeleton className="mx-auto hidden h-9 w-full max-w-md rounded-full md:block" />
          <Skeleton className="ml-auto size-9 rounded-full" />
        </header>
        <main className="flex-1 px-4 py-7 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl"><PageSkeleton pathname={pathname} /></div>
        </main>
      </div>
    </div>
  );
}

/** Full-screen auth/session check placeholder; deliberately avoids importing the admin shell. */
export function AuthSkeleton() {
  return (
    <div className="auth-dark-pin relative flex min-h-screen items-center justify-center overflow-hidden bg-green-900 p-6">
      <span className="pointer-events-none absolute -left-20 -top-24 size-72 rounded-full bg-gold/15 blur-3xl" aria-hidden />
      <SkeletonGroup label="Checking your admin session" className="relative">
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-3">
            <Skeleton tone="gold" className="size-10 rounded-xl" />
            <Skeleton tone="dark" className="h-7 w-28" />
            <Skeleton tone="gold" className="h-5 w-12 rounded-md" />
          </div>
          <Skeleton tone="gold" className="mt-1 h-1 w-32 rounded-full" />
          <Skeleton tone="dark" className="h-2.5 w-36 rounded-full" />
        </div>
      </SkeletonGroup>
    </div>
  );
}
