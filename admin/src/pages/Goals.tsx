import { useMemo, useState } from "react";
import { useLoaderData, useRevalidator } from "react-router-dom";
import { api, type GoalInput } from "@/lib/api";
import type { Goal, GoalCadence, GoalRing, GoalStatus, GoalVerdict } from "@/lib/types";
import { PageHeader, Card, Empty, Pill, Select } from "@/components/ui";
import { Stagger, StaggerItem } from "@/components/motion";
import { formatDate } from "@/lib/format";
import { BusyLabel } from "@/components/skeleton";
import { useAuth } from "@/lib/auth";

export async function loader(): Promise<Goal[]> {
  return api.adminGoals();
}

const inputCls = "w-full rounded-lg border border-sand bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-green-text focus:outline-none focus:ring-2 focus:ring-green/15";
const labelCls = "mb-1 block text-xs font-medium text-ink-muted";

const CADENCES: { value: GoalCadence; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "semiannual", label: "Semi-annual" },
  { value: "annual", label: "Annual" },
];
const CADENCE_LABEL: Record<GoalCadence, string> = {
  daily: "Daily", weekly: "Weekly", monthly: "Monthly",
  quarterly: "Quarterly", semiannual: "Semi-annual", annual: "Annual",
};

const RINGS: { value: GoalRing; label: string }[] = [
  { value: "", label: "None — townwide" },
  { value: "self", label: "Self" },
  { value: "home", label: "Home" },
  { value: "school", label: "School" },
  { value: "work", label: "Work" },
  { value: "town", label: "Town" },
  { value: "nation", label: "Nation" },
];
const RING_LABEL: Record<Exclude<GoalRing, "">, string> = {
  self: "Self", home: "Home", school: "School", work: "Work", town: "Town", nation: "Nation",
};

type Tone = "neutral" | "green" | "gold" | "clay";
// Section + pill treatment per computed status. `badge` is a solid chip used on
// the card; `tone` drives the section header Pill.
const STATUS_META: Record<GoalStatus, { label: string; tone: Tone; badge: string }> = {
  active: { label: "In progress", tone: "green", badge: "bg-green/[0.1] text-green-text" },
  pending_review: { label: "Awaiting review", tone: "gold", badge: "bg-gold/[0.18] text-gold-text" },
  achieved: { label: "Achieved", tone: "green", badge: "bg-green text-on-green" },
  missed: { label: "Missed", tone: "clay", badge: "bg-clay text-white" },
};
const STATUS_ORDER: GoalStatus[] = ["active", "pending_review", "achieved", "missed"];

interface FormState {
  title: string; description: string; target: string;
  cadence: GoalCadence; periodLabel: string; periodStart: string; periodEnd: string;
  ring: GoalRing; setAtDurbar: boolean; featured: boolean;
}
const EMPTY_FORM: FormState = {
  title: "", description: "", target: "",
  cadence: "annual", periodLabel: "", periodStart: "", periodEnd: "",
  ring: "", setAtDurbar: false, featured: false,
};

/** A date-input value ("2026-01-01") → RFC3339 at UTC midnight, or "" when blank. */
function dateToISO(value: string): string {
  if (!value.trim()) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}
/** An RFC3339 instant → the "YYYY-MM-DD" a date input expects. */
function isoToDate(iso?: string): string {
  return iso ? iso.slice(0, 10) : "";
}

function toForm(g: Goal): FormState {
  return {
    title: g.title, description: g.description, target: g.target ?? "",
    cadence: g.cadence, periodLabel: g.periodLabel,
    periodStart: isoToDate(g.periodStart), periodEnd: isoToDate(g.periodEnd),
    ring: g.ring ?? "", setAtDurbar: g.setAtDurbar, featured: g.featured,
  };
}
function toPayload(f: FormState): GoalInput {
  return {
    title: f.title.trim(), description: f.description.trim(), target: f.target.trim(),
    cadence: f.cadence, periodLabel: f.periodLabel.trim(),
    periodStart: dateToISO(f.periodStart), periodEnd: dateToISO(f.periodEnd),
    setAtDurbar: f.setAtDurbar, ring: f.ring, featured: f.featured,
  };
}

function sortGoals(list: Goal[]): Goal[] {
  return [...list].sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    if (a.setAtDurbar !== b.setAtDurbar) return a.setAtDurbar ? -1 : 1;
    return (Date.parse(b.periodStart) || 0) - (Date.parse(a.periodStart) || 0);
  });
}

export function Component() {
  const goals = useLoaderData() as Goal[];
  const { revalidate } = useRevalidator();
  const { member } = useAuth();
  const role = member?.role;
  const canCurate = role === "curator" || role === "steward";
  const canReview = role === "accountability" || role === "steward";

  const [editing, setEditing] = useState<Goal | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const flagship = useMemo(
    () => goals.find((g) => g.featured) ?? goals.find((g) => g.setAtDurbar && g.cadence === "annual") ?? null,
    [goals],
  );
  const rest = flagship ? goals.filter((g) => g.id !== flagship.id) : goals;
  const groups = STATUS_ORDER
    .map((status) => ({ status, items: sortGoals(rest.filter((g) => g.status === status)) }))
    .filter((group) => group.items.length > 0);

  const activeCount = goals.filter((g) => g.status === "active").length;
  const pendingCount = goals.filter((g) => g.status === "pending_review").length;

  function openNew() { setEditing("new"); setForm(EMPTY_FORM); setError(null); }
  function openEdit(g: Goal) { setEditing(g); setForm(toForm(g)); setError(null); }

  async function save() {
    if (!form.title.trim() || !form.description.trim() || !form.periodLabel.trim() || !form.periodStart || !form.periodEnd) {
      setError("Title, description, a period label, and both period dates are required.");
      return;
    }
    if (Date.parse(form.periodEnd) < Date.parse(form.periodStart)) {
      setError("The period must end on or after it starts.");
      return;
    }
    setBusy(true); setError(null);
    try {
      const payload = toPayload(form);
      if (editing === "new") await api.createGoal(payload);
      else if (editing) await api.updateGoal(editing.id, payload);
      setEditing(null);
      revalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the goal.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(g: Goal) {
    if (!window.confirm(`Delete “${g.title}”? It leaves the public scoreboard and cannot be recovered.`)) return;
    setRowBusy(g.id); setError(null);
    try {
      await api.deleteGoal(g.id);
      if (editing !== "new" && editing?.id === g.id) setEditing(null);
      revalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the goal.");
    } finally {
      setRowBusy(null);
    }
  }

  return (
    <>
      <PageHeader kicker="Civic accountability · durbar commitments" title="Town goals">
        <div className="flex flex-wrap items-center gap-2">
          {pendingCount > 0 && <Pill tone="gold">{pendingCount} awaiting review</Pill>}
          <Pill tone={activeCount > 0 ? "green" : "neutral"}>{activeCount} in progress</Pill>
          {canCurate && (
            <button type="button" onClick={openNew} className="rounded-lg bg-green px-4 py-2 text-sm font-semibold text-on-green hover:bg-green-900">
              New goal
            </button>
          )}
        </div>
      </PageHeader>

      <p className="mb-5 max-w-2xl text-sm text-ink-muted">
        Collective commitments the town sets for a period — the flagship being the annual goal declared at the grand
        durbar. Curators author and edit goals; once a period closes, a separate accountability officer records whether
        it was <b>achieved</b> or <b>missed</b>. Stewards may do both.
      </p>

      {canCurate && editing && (
        <Card className="mb-6 p-5">
          <h2 className="mb-4 text-base font-semibold text-ink">{editing === "new" ? "Set a new goal" : `Edit “${editing.title}”`}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block sm:col-span-2 lg:col-span-3"><span className={labelCls}>Title</span>
              <input value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={160} className={inputCls} placeholder="A cleaner Oguaa by the next durbar" /></label>

            <label className="block sm:col-span-2 lg:col-span-3"><span className={labelCls}>Description</span>
              <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} className={inputCls} placeholder="What the town is committing to, and why it matters…" /></label>

            <label className="block sm:col-span-2 lg:col-span-3"><span className={labelCls}>Target (optional — the measurable outcome)</span>
              <input value={form.target} onChange={(e) => set("target", e.target.value)} className={inputCls} placeholder="Plant 10,000 trees across the seven quarters" /></label>

            <label className="block"><span className={labelCls}>Cadence</span>
              <Select value={form.cadence} onValueChange={(cadence) => set("cadence", cadence as GoalCadence)} className="w-full">
                {CADENCES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select></label>

            <label className="block"><span className={labelCls}>Period label</span>
              <input value={form.periodLabel} onChange={(e) => set("periodLabel", e.target.value)} className={inputCls} placeholder="2026" /></label>

            <label className="block"><span className={labelCls}>Ring</span>
              <Select value={form.ring} onValueChange={(ring) => set("ring", ring as GoalRing)} className="w-full">
                {RINGS.map((r) => <option key={r.value || "none"} value={r.value}>{r.label}</option>)}
              </Select></label>

            <label className="block"><span className={labelCls}>Period starts</span>
              <input type="date" value={form.periodStart} onChange={(e) => set("periodStart", e.target.value)} className={inputCls} /></label>

            <label className="block"><span className={labelCls}>Period ends</span>
              <input type="date" value={form.periodEnd} onChange={(e) => set("periodEnd", e.target.value)} className={inputCls} /></label>

            <div className="flex flex-col justify-end gap-2">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={form.setAtDurbar} onChange={(e) => set("setAtDurbar", e.target.checked)} className="accent-green" /> Set at the grand durbar</label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={form.featured} onChange={(e) => set("featured", e.target.checked)} className="accent-green" /> Flagship (feature it)</label>
            </div>
          </div>
          {error && <p className="mt-3 text-sm text-clay-text">{error}</p>}
          <div className="mt-4 flex gap-3">
            <button type="button" onClick={save} disabled={busy} className="rounded-lg bg-green px-4 py-2 text-sm font-semibold text-on-green hover:bg-green-900 disabled:opacity-50">
              {busy ? <BusyLabel label="Saving goal" className="justify-center" /> : editing === "new" ? "Set goal" : "Save changes"}
            </button>
            <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-sand px-4 py-2 text-sm text-ink-muted hover:bg-paper">Cancel</button>
          </div>
        </Card>
      )}

      {error && !editing && <p className="mb-4 text-sm text-clay-text">{error}</p>}

      {goals.length === 0 ? (
        <Empty icon="calendar" title="No goals set yet">
          {canCurate ? "Set the town's first commitment above — start with the annual durbar goal." : "Nothing has been committed yet — a curator will set the town's goals."}
        </Empty>
      ) : (
        <div className="space-y-8">
          {flagship && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-gold-text">Flagship goal</h2>
              <GoalCard goal={flagship} flagship canCurate={canCurate} canReview={canReview} onEdit={openEdit} onDelete={remove} onChanged={revalidate} deleting={rowBusy === flagship.id} />
            </section>
          )}

          {groups.map((group) => (
            <section key={group.status}>
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-sm font-bold uppercase tracking-wide text-ink-muted">{STATUS_META[group.status].label}</h2>
                <Pill tone={STATUS_META[group.status].tone}>{group.items.length}</Pill>
              </div>
              <Stagger className="space-y-3">
                {group.items.map((g, idx) => (
                  <StaggerItem key={g.id} index={idx}>
                    <GoalCard goal={g} canCurate={canCurate} canReview={canReview} onEdit={openEdit} onDelete={remove} onChanged={revalidate} deleting={rowBusy === g.id} />
                  </StaggerItem>
                ))}
              </Stagger>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

interface GoalCardProps {
  goal: Goal;
  flagship?: boolean;
  canCurate: boolean;
  canReview: boolean;
  onEdit: (g: Goal) => void;
  onDelete: (g: Goal) => void;
  onChanged: () => void;
  deleting: boolean;
}

function GoalCard({ goal, flagship = false, canCurate, canReview, onEdit, onDelete, onChanged, deleting }: Readonly<GoalCardProps>) {
  const [verdict, setVerdict] = useState<GoalVerdict | null>(null);
  const [note, setNote] = useState("");
  const [verdictBusy, setVerdictBusy] = useState(false);
  const [verdictError, setVerdictError] = useState<string | null>(null);

  const meta = STATUS_META[goal.status];
  const reviewed = goal.status === "achieved" || goal.status === "missed" || Boolean(goal.reviewedAt);
  const canRecord = canReview && (goal.status === "active" || goal.status === "pending_review");

  function openVerdict(next: GoalVerdict) {
    setVerdict(next); setNote(""); setVerdictError(null);
  }

  async function submitVerdict() {
    if (!verdict) return;
    if (!note.trim()) { setVerdictError("A note is required to record the verdict."); return; }
    setVerdictBusy(true); setVerdictError(null);
    try {
      await api.reviewGoal(goal.id, { status: verdict, note: note.trim() });
      setVerdict(null); setNote("");
      onChanged();
    } catch (e) {
      const status = (e as { status?: number }).status;
      setVerdictError(status === 403
        ? "Only an accountability officer can record the verdict."
        : e instanceof Error ? e.message : "Could not record the verdict.");
    } finally {
      setVerdictBusy(false);
    }
  }

  return (
    <Card className={`p-5 ${flagship ? "border-gold-border bg-gold/[0.04]" : ""} ${goal.status === "missed" ? "opacity-90" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.badge}`}>{meta.label}</span>
        <Pill tone="neutral">{CADENCE_LABEL[goal.cadence]}</Pill>
        <Pill tone="gold">{goal.periodLabel}</Pill>
        {goal.ring && <Pill tone="neutral">Ring · {RING_LABEL[goal.ring]}</Pill>}
        {goal.setAtDurbar && <Pill tone="green">Grand durbar</Pill>}
        {flagship && <Pill tone="gold">★ Flagship</Pill>}
      </div>

      <h3 className={`mt-2 font-semibold text-ink ${flagship ? "text-2xl" : "text-lg"}`}>{goal.title}</h3>
      <p className="mt-1 max-w-2xl text-sm text-ink-muted">{goal.description}</p>
      {goal.target && <p className="mt-2 text-sm font-medium text-green-text">Target · {goal.target}</p>}
      <p className="mt-2 text-xs text-ink-faint">
        {formatDate(goal.periodStart)} → {formatDate(goal.periodEnd)}
        {goal.createdByName ? ` · set by ${goal.createdByName}` : ""} · {formatDate(goal.createdAt)}
      </p>

      {reviewed && (
        <div className="mt-3 rounded-xl border border-sand bg-paper px-4 py-3">
          <p className="text-[0.65rem] font-bold uppercase tracking-wide text-ink-faint">Recorded verdict</p>
          <p className="mt-1 text-sm text-ink">
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${meta.badge}`}>{meta.label}</span>
            {goal.reviewedByName ? <> by {goal.reviewedByName}</> : null}
            {goal.reviewedAt ? <> · {formatDate(goal.reviewedAt)}</> : null}
          </p>
          {goal.reviewNote && <p className="mt-1.5 text-sm italic text-ink-muted">“{goal.reviewNote}”</p>}
        </div>
      )}

      {(canCurate || canRecord) && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-sand pt-4">
          {canCurate && (
            <>
              <button type="button" onClick={() => onEdit(goal)} className="rounded-full border border-sand px-4 py-1.5 text-xs font-semibold text-ink-muted hover:bg-paper">Edit</button>
              <button type="button" disabled={deleting} onClick={() => onDelete(goal)} className="rounded-full border border-maroon-text/40 px-4 py-1.5 text-xs font-semibold text-maroon-text hover:bg-maroon-900/[0.05] disabled:opacity-50">
                {deleting ? <BusyLabel label="Deleting goal" className="justify-center" /> : "Delete"}
              </button>
            </>
          )}
          {canRecord && verdict === null && (
            <>
              <span className="mr-1 text-xs text-ink-faint">{goal.status === "pending_review" ? "Period closed — record the verdict:" : "Record the verdict:"}</span>
              <button type="button" onClick={() => openVerdict("achieved")} className="rounded-full border border-green-text/40 px-4 py-1.5 text-xs font-semibold text-green-text hover:bg-green/[0.06]">Mark achieved</button>
              <button type="button" onClick={() => openVerdict("missed")} className="rounded-full border border-clay/40 px-4 py-1.5 text-xs font-semibold text-clay-text hover:bg-clay/[0.06]">Mark missed</button>
            </>
          )}
        </div>
      )}

      {canRecord && verdict !== null && (
        <div className="mt-3 rounded-xl border border-sand bg-paper p-4">
          <p className="text-sm font-semibold text-ink">
            Mark <span className={verdict === "achieved" ? "text-green-text" : "text-clay-text"}>{verdict}</span> — {goal.title}
          </p>
          <label className="mt-2 block"><span className={labelCls}>Note (required — the town sees this on the scoreboard)</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={inputCls} placeholder={verdict === "achieved" ? "How the town met the commitment…" : "What fell short, and what comes next…"} /></label>
          {verdictError && <p className="mt-2 text-sm text-clay-text">{verdictError}</p>}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={submitVerdict} disabled={verdictBusy} className="rounded-full bg-green px-4 py-1.5 text-xs font-semibold text-on-green hover:bg-green-900 disabled:opacity-50">
              {verdictBusy ? <BusyLabel label="Recording verdict" className="justify-center" /> : "Record verdict"}
            </button>
            <button type="button" onClick={() => { setVerdict(null); setVerdictError(null); }} className="rounded-full border border-sand px-4 py-1.5 text-xs text-ink-muted hover:bg-cream">Cancel</button>
          </div>
        </div>
      )}

      {/* A 403 can still land here if the caller lacks the accountability role. */}
      {canRecord && verdict === null && verdictError && <p className="mt-2 text-sm text-clay-text">{verdictError}</p>}
    </Card>
  );
}
