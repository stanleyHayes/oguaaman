import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Connection, Organization, SchoolStint } from "@/lib/types";
import { api } from "@/lib/api";
import { Avatar } from "@/components/ui";
import { EmptyState } from "@/components/empty-state";

/**
 * SchoolingEditor — members record the schools they attended and the years they
 * were there. Overlapping years at the same school make people classmates, which
 * powers "people you may know" (spec §8.6). Saving bumps `onSaved` so the
 * suggestions panel refetches.
 */
export function SchoolingEditor({
  schools,
  initial,
  onSaved,
}: Readonly<{
  schools: Organization[];
  initial: SchoolStint[];
  onSaved?: () => void;
}>) {
  const [rows, setRows] = useState<(SchoolStint & { _key: string })[]>(() =>
    (initial.length ? initial : []).map((r, i) => ({ ...r, _key: `init-${i}` }))
  );
  const seq = useRef(initial.length);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  function update(i: number, patch: Partial<SchoolStint>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    setState("idle");
  }
  function addRow() {
    setRows((rs) => [...rs, { schoolId: "", fromYear: undefined, toYear: undefined, _key: `row-${seq.current++}` }]);
    setState("idle");
  }
  function removeRow(i: number) {
    setRows((rs) => rs.filter((_, idx) => idx !== i));
    setState("idle");
  }

  async function save() {
    const clean = rows
      .filter((r) => r.schoolId)
      .map((r) => ({
        schoolId: r.schoolId,
        fromYear: r.fromYear || undefined,
        toYear: r.toYear || undefined,
      }));
    setState("saving");
    try {
      await api.setSchooling({ schooling: clean });
      setState("saved");
      onSaved?.();
    } catch {
      setState("error");
    }
  }

  return (
    <div className="mt-4 space-y-3">
      {rows.map((row, i) => (
        <div key={row._key} className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-sand bg-cream p-3">
          <select
            value={row.schoolId}
            onChange={(e) => update(i, { schoolId: e.target.value })}
            className="min-w-[12rem] flex-1 rounded-md border border-sand bg-paper px-3 py-2 text-sm text-ink focus:border-maroon-900 focus:outline-none"
          >
            <option value="">Choose a school…</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <input
            type="number" inputMode="numeric" placeholder="From" min={1900} max={2100}
            value={row.fromYear ?? ""}
            onChange={(e) => update(i, { fromYear: e.target.value ? Number(e.target.value) : undefined })}
            className="w-24 rounded-md border border-sand bg-paper px-3 py-2 text-sm text-ink focus:border-maroon-900 focus:outline-none"
          />
          <span className="text-ink-faint">–</span>
          <input
            type="number" inputMode="numeric" placeholder="To" min={1900} max={2100}
            value={row.toYear ?? ""}
            onChange={(e) => update(i, { toYear: e.target.value ? Number(e.target.value) : undefined })}
            className="w-24 rounded-md border border-sand bg-paper px-3 py-2 text-sm text-ink focus:border-maroon-900 focus:outline-none"
          />
          <button
            type="button" onClick={() => removeRow(i)} aria-label="Remove school"
            className="rounded-full p-2 text-ink-faint hover:bg-sand hover:text-clay-text"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={addRow} className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-maroon-900/40 px-4 py-2 text-sm font-medium text-maroon-900 hover:bg-maroon-900/[0.06]">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
          Add a school
        </button>
        {rows.length > 0 && (
          <button type="button" onClick={save} disabled={state === "saving"} className="rounded-full bg-maroon-900 px-5 py-2 text-sm font-semibold text-cream hover:bg-maroon-900/90 disabled:opacity-60">
            {state === "saving" ? "Saving…" : "Save schooling"}
          </button>
        )}
        {state === "saved" && <span className="text-sm text-teal-text">Saved ✓ — suggestions updated below.</span>}
        {state === "error" && <span className="text-sm text-clay-text">Couldn&rsquo;t save. Try again.</span>}
      </div>
    </div>
  );
}

/** A compact Follow toggle for the suggestions panel (light background). */
function FollowChip({ slug, name }: Readonly<{ slug: string; name: string }>) {
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const next = !following;
    setFollowing(next);
    try {
      const r = next ? await api.followMember(slug) : await api.unfollowMember(slug);
      setFollowing(r.following);
    } catch {
      setFollowing(!next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button" onClick={toggle} disabled={busy} aria-pressed={following}
      aria-label={following ? `Following ${name}` : `Follow ${name}`}
      className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors disabled:opacity-70 ${
        following ? "border-green bg-green/[0.08] text-green" : "border-green text-green hover:bg-green hover:text-cream"
      }`}
    >
      {following ? "Following" : "Follow"}
    </button>
  );
}

/**
 * PeopleYouMayKnow — surfaces members connected to you by school (classmates,
 * by overlapping years), quarter, and Asafo. Mount with a `key` that changes
 * after the viewer edits their schooling to refetch (see Me.tsx).
 */
export function PeopleYouMayKnow() {
  const [list, setList] = useState<Connection[] | null>(null);

  useEffect(() => {
    let alive = true;
    api.connections()
      .then((c) => { if (alive) setList(c); })
      .catch(() => { if (alive) setList([]); });
    return () => { alive = false; };
  }, []);

  if (list === null) return <p className="mt-4 text-sm text-ink-muted">Finding your people…</p>;

  if (list.length === 0) {
    return (
      <EmptyState
        className="!py-10"
        title="No suggestions yet"
        description="Add your schooling, quarter and Asafo above — we&rsquo;ll connect you with classmates and neighbours who share them."
      />
    );
  }

  return (
    <ul className="mt-4 grid gap-3">
      {list.map((c) => (
        <li key={c.member.id} className="flex items-center gap-3 rounded-[var(--radius-card)] border border-sand bg-cream p-4">
          <Link to={`/members/${c.member.slug}`} className="shrink-0">
            <Avatar initials={c.member.initials} photoUrl={c.member.photoUrl} size={44} className="border border-sand" />
          </Link>
          <div className="min-w-0 flex-1">
            <Link to={`/members/${c.member.slug}`} className="block truncate text-lg text-ink hover:text-green">
              {c.member.displayName}
            </Link>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {c.reasons.map((r) => (
                <span key={r} className="whitespace-nowrap rounded-full bg-sand px-2.5 py-0.5 text-xs font-medium text-ink-muted">{r}</span>
              ))}
            </div>
          </div>
          <div className="shrink-0">
            <FollowChip slug={c.member.slug} name={c.member.displayName} />
          </div>
        </li>
      ))}
    </ul>
  );
}
