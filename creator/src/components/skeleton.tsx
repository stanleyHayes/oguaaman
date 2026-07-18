import type { CSSProperties, ReactNode } from "react";

type SkeletonTone = "default" | "on-dark";

interface SkeletonProps {
  className?: string;
  tone?: SkeletonTone;
  style?: CSSProperties;
}

/** Theme-aware visual placeholder. Its meaning is supplied by SkeletonGroup/BusyLabel. */
export function Skeleton({ className = "", tone = "default", style }: Readonly<SkeletonProps>) {
  return (
    <span
      aria-hidden="true"
      style={style}
      className={`oguaa-skeleton block ${tone === "on-dark" ? "oguaa-skeleton-on-dark" : ""} ${className}`}
    />
  );
}

/** One polite, accessible status wrapper for a composed skeleton scene. */
export function SkeletonGroup({ label, children, className = "" }: Readonly<{ label: string; children: ReactNode; className?: string }>) {
  return (
    <section role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </section>
  );
}

/** Keeps mutation controls stable while replacing temporary verb swaps with shimmer. */
export function BusyLabel({ label, className = "", width = "w-16" }: Readonly<{ label: string; className?: string; width?: string }>) {
  return (
    <span aria-live="polite" aria-busy="true" className={`inline-flex min-h-5 items-center justify-center ${className}`}>
      <span className="sr-only">{label}</span>
      <Skeleton className={`h-2.5 ${width} rounded-full`} />
    </span>
  );
}

const ROWS = ["row-a", "row-b", "row-c", "row-d", "row-e", "row-f", "row-g", "row-h"];
const CARDS = ["card-a", "card-b", "card-c", "card-d", "card-e", "card-f"];

/** Reusable local list-row placeholder for data directories and activity feeds. */
export function RowSkeleton({ compact = false }: Readonly<{ compact?: boolean }>) {
  return (
    <div className={`flex items-center gap-3 border-b border-sand last:border-b-0 ${compact ? "py-3" : "py-4"}`} aria-hidden="true">
      <Skeleton className={`${compact ? "size-9" : "size-11"} shrink-0 rounded-xl`} />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-3 w-2/5 max-w-52 rounded-full" />
        <Skeleton className="h-2.5 w-3/5 max-w-72 rounded-full" />
      </div>
      <Skeleton className="hidden h-7 w-20 shrink-0 rounded-full sm:block" />
    </div>
  );
}

export function SkeletonRows({ count = 5, compact = false, className = "" }: Readonly<{ count?: number; compact?: boolean; className?: string }>) {
  return (
    <div className={className}>
      {ROWS.slice(0, count).map((key) => <RowSkeleton key={key} compact={compact} />)}
    </div>
  );
}

/** Reusable local card placeholder for plan, institution and workspace grids. */
export function CardSkeleton({ tall = false }: Readonly<{ tall?: boolean }>) {
  return (
    <div className={`rounded-card border border-sand bg-paper p-5 ${tall ? "min-h-64" : "min-h-40"}`} aria-hidden="true">
      <div className="flex items-start justify-between gap-4">
        <Skeleton className="size-10 rounded-xl" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <Skeleton className="mt-5 h-4 w-1/2 rounded-full" />
      <Skeleton className="mt-3 h-2.5 w-full rounded-full" />
      <Skeleton className="mt-2 h-2.5 w-4/5 rounded-full" />
      {tall && (
        <div className="mt-7 space-y-3">
          <Skeleton className="h-9 w-full rounded-xl" />
          <Skeleton className="h-9 w-full rounded-xl" />
        </div>
      )}
    </div>
  );
}

export function SkeletonCards({ count = 3, tall = false, className = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3" }: Readonly<{ count?: number; tall?: boolean; className?: string }>) {
  return (
    <div className={className}>
      {CARDS.slice(0, count).map((key) => <CardSkeleton key={key} tall={tall} />)}
    </div>
  );
}

export type PageSkeletonVariant = "overview" | "list" | "editor" | "workspace" | "money" | "settings";

function PageHeadingSkeleton() {
  return (
    <div className="mb-6" aria-hidden="true">
      <Skeleton className="h-2.5 w-20 rounded-full" />
      <Skeleton className="mt-3 h-8 w-64 max-w-[72vw] rounded-xl" />
      <Skeleton className="mt-3 h-3 w-full max-w-xl rounded-full" />
    </div>
  );
}

function MetricSkeletons() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
      {CARDS.slice(0, 4).map((key) => (
        <div key={key} className="rounded-card border border-sand bg-paper p-5">
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-3 w-24 rounded-full" />
            <Skeleton className="size-9 rounded-xl" />
          </div>
          <Skeleton className="mt-6 h-8 w-20 rounded-lg" />
          <Skeleton className="mt-3 h-2.5 w-3/4 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <>
      <MetricSkeletons />
      <div className="mt-5 grid gap-5 lg:grid-cols-2" aria-hidden="true">
        {CARDS.slice(0, 4).map((key) => (
          <div key={key} className="rounded-card border border-sand bg-paper p-5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-32 rounded-full" />
              <Skeleton className="h-2.5 w-16 rounded-full" />
            </div>
            <Skeleton className="mt-6 h-44 w-full rounded-xl" />
          </div>
        ))}
      </div>
    </>
  );
}

function ListSkeleton() {
  return (
    <div className="overflow-hidden rounded-card border border-sand bg-paper px-5" aria-hidden="true">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sand py-4">
        <Skeleton className="h-9 w-56 max-w-full rounded-full" />
        <Skeleton className="h-9 w-28 rounded-full" />
      </div>
      <SkeletonRows count={6} />
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]" aria-hidden="true">
      <div className="space-y-5 rounded-card border border-sand bg-paper p-5">
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-10 w-32 rounded-full" />
      </div>
      <CardSkeleton tall />
    </div>
  );
}

function WorkspaceSkeleton() {
  return (
    <>
      <SkeletonCards count={3} tall />
      <div className="mt-5 overflow-hidden rounded-card border border-sand bg-paper px-5" aria-hidden="true">
        <SkeletonRows count={4} compact />
      </div>
    </>
  );
}

function MoneySkeleton() {
  return (
    <>
      <MetricSkeletons />
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.6fr)]" aria-hidden="true">
        <div className="rounded-card border border-sand bg-paper px-5"><SkeletonRows count={6} compact /></div>
        <CardSkeleton tall />
      </div>
    </>
  );
}

function SettingsSkeleton() {
  return <SkeletonCards count={2} tall className="grid items-start gap-5 lg:grid-cols-2" />;
}

/** Route-shaped loading state, selected from the destination path. */
export function PageSkeleton({ variant = "overview", label = "Loading page" }: Readonly<{ variant?: PageSkeletonVariant; label?: string }>) {
  let content: ReactNode;
  if (variant === "list") content = <ListSkeleton />;
  else if (variant === "editor") content = <EditorSkeleton />;
  else if (variant === "workspace") content = <WorkspaceSkeleton />;
  else if (variant === "money") content = <MoneySkeleton />;
  else if (variant === "settings") content = <SettingsSkeleton />;
  else content = <OverviewSkeleton />;

  return (
    <SkeletonGroup label={label} className="animate-in fade-in duration-200">
      <PageHeadingSkeleton />
      {content}
    </SkeletonGroup>
  );
}

/** Full creator frame shown while the post-auth data router resolves its first route. */
export function AppShellSkeleton() {
  return (
    <SkeletonGroup label="Loading creator studio" className="min-h-screen bg-paper">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-navy-soft bg-navy px-4 py-5 lg:block" aria-hidden="true">
        <div className="flex items-center gap-3">
          <Skeleton tone="on-dark" className="size-8 rounded-lg" />
          <Skeleton tone="on-dark" className="h-4 w-28 rounded-full" />
        </div>
        <div className="mt-10 space-y-7">
          {CARDS.slice(0, 4).map((key) => (
            <div key={key} className="space-y-3">
              <Skeleton tone="on-dark" className="h-2.5 w-20 rounded-full" />
              <Skeleton tone="on-dark" className="h-8 w-full rounded-lg" />
              <Skeleton tone="on-dark" className="h-8 w-4/5 rounded-lg" />
            </div>
          ))}
        </div>
      </aside>
      <div className="min-h-screen lg:pl-60">
        <header className="flex h-16 items-center justify-between border-b border-sand bg-cream/90 px-4 sm:px-6" aria-hidden="true">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-xl" />
            <div className="space-y-2"><Skeleton className="h-3.5 w-36 rounded-full" /><Skeleton className="h-2 w-24 rounded-full" /></div>
          </div>
          <Skeleton className="h-9 w-32 rounded-full" />
        </header>
        <main className="px-4 py-7 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl"><PageSkeleton variant="overview" label="Loading overview" /></div>
        </main>
      </div>
    </SkeletonGroup>
  );
}

/** Branded auth-gate placeholder with no visible progress copy. */
export function AuthSkeleton({ tag = "Creator" }: Readonly<{ tag?: string }>) {
  return (
    <SkeletonGroup label={`Loading ${tag} studio`} className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-2" aria-hidden="true">
        <Skeleton tone="on-dark" className="size-9 rounded-lg" />
        <Skeleton tone="on-dark" className="h-7 w-28 rounded-lg" />
        <Skeleton tone="on-dark" className="h-5 w-14 rounded-md" />
      </div>
      <Skeleton tone="on-dark" className="mt-1 h-1 w-32 rounded-full" />
      <Skeleton tone="on-dark" className="h-2.5 w-36 rounded-full" />
    </SkeletonGroup>
  );
}
