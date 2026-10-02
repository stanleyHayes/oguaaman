import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { SettingsAudit, SettingsKey } from "@/lib/types";
import { formatDateTime, humanize } from "@/lib/format";
import { Skeleton, SkeletonGroup } from "@/components/skeleton";
import { Empty } from "@/components/ui";
import { Panel } from "@/components/admin-kit";

type State =
  | { status: "loading" }
  | { status: "ready"; rows: SettingsAudit[] }
  | { status: "forbidden" }
  | { status: "error"; message: string };

const IGNORED = new Set(["version", "updatedAt", "updatedByName", "effectiveFrom", "createdAt"]);

interface Change { field: string; before: string; after: string }

function parse(json: string): Record<string, unknown> {
  try {
    const v = JSON.parse(json) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function show(v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  if (typeof v === "boolean") return v ? "on" : "off";
  if (typeof v === "string" || typeof v === "number") return String(v);
  return JSON.stringify(v);
}

/** Field-level changes between two canonical JSON documents. Nested values
 *  (placement rows, keyword lists) are compared as JSON and shown compactly. */
function diffSettings(before: string, after: string): Change[] {
  const a = parse(before);
  const b = parse(after);
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => !IGNORED.has(k)).sort((x, y) => x.localeCompare(y));
  return keys
    .filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
    .map((k) => ({ field: k, before: show(a[k]), after: show(b[k]) }));
}

function label(field: string): string {
  return humanize(field.replaceAll(/([a-z])([A-Z])/g, "$1 $2").toLowerCase());
}

function AuditRow({ row }: Readonly<{ row: SettingsAudit }>) {
  const changes = diffSettings(row.before, row.after);
  const created = row.before === "" || row.before === "null" || row.before === "{}";
  const deleted = row.after === "" || row.after === "null" || row.after === "{}";
  return (
    <li className="relative pl-6">
      <span aria-hidden className="absolute left-[5px] top-2 h-2 w-2 rounded-full bg-gold-brand ring-4 ring-cream" />
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-sm font-semibold text-ink">{row.actorName || "Staff"}</p>
        <time dateTime={row.at} className="text-xs tabular-nums text-ink-faint">{formatDateTime(row.at)}</time>
      </div>
      {row.reason && <p className="mt-0.5 max-w-[65ch] text-sm leading-relaxed text-ink-muted [text-wrap:pretty]">“{row.reason}”</p>}
      {created && <p className="mt-1 text-xs text-ink-faint">Created</p>}
      {deleted && <p className="mt-1 text-xs text-ink-faint">Deleted</p>}
      {!created && !deleted && changes.length > 0 && (
        <dl className="mt-2 grid gap-1 text-xs">
          {changes.slice(0, 8).map((c) => (
            <div key={c.field} className="grid grid-cols-[minmax(7rem,11rem)_1fr] gap-2">
              <dt className="truncate text-ink-faint" title={c.field}>{label(c.field)}</dt>
              <dd className="min-w-0 break-words font-mono text-[0.7rem] text-ink">
                <span className="text-ink-faint line-through decoration-ink-faint/60">{c.before}</span>
                <span aria-hidden className="mx-1.5 text-gold-text">→</span>
                <span className="sr-only"> changed to </span>
                {c.after}
              </dd>
            </div>
          ))}
          {changes.length > 8 && <p className="text-ink-faint">and {changes.length - 8} more fields</p>}
        </dl>
      )}
    </li>
  );
}

/**
 * Change history for a settings document (GET /api/admin/settings/audit).
 * The endpoint is curator-only; editors see a short explanation instead.
 * `refreshKey` re-fetches after a save.
 */
export function SettingsAuditHistory({ settingsKey, refreshKey = 0, title = "Change history" }: Readonly<{ settingsKey: SettingsKey; refreshKey?: number; title?: string }>) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let live = true;
    api.settingsAudit(settingsKey, 50)
      .then((rows) => { if (live) setState({ status: "ready", rows: rows ?? [] }); })
      .catch((e: unknown) => {
        if (!live) return;
        if (e instanceof ApiError && e.status === 403) setState({ status: "forbidden" });
        else setState({ status: "error", message: "We couldn't load the change history. Reload the page to try again." });
      });
    return () => { live = false; };
  }, [settingsKey, refreshKey]);

  return (
    <Panel title={title} aside="Every save is recorded with who made it, when, and why.">
      {state.status === "loading" && (
        <SkeletonGroup label="Loading change history" className="space-y-4">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="pl-6"><Skeleton className="h-3 w-40 rounded-full" /><Skeleton className="mt-2 h-3 w-3/4 rounded-full" /></div>
          ))}
        </SkeletonGroup>
      )}
      {state.status === "forbidden" && <p className="text-sm text-ink-muted">Change history is visible to curators and stewards.</p>}
      {state.status === "error" && <p className="text-sm text-clay-text" role="alert">{state.message}</p>}
      {state.status === "ready" && state.rows.length === 0 && (
        <Empty compact icon="calendar" title="No changes yet">The defaults are in force. The first save will appear here.</Empty>
      )}
      {state.status === "ready" && state.rows.length > 0 && (
        <ol className="relative space-y-5 before:absolute before:bottom-1 before:left-[8px] before:top-2 before:w-px before:bg-sand">
          {state.rows.map((row) => <AuditRow key={row.id} row={row} />)}
        </ol>
      )}
    </Panel>
  );
}
