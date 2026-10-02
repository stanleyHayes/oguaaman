import { useMemo, useState, type ReactNode } from "react";
import { useLoaderData } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { api } from "@/lib/api";
import type { Election, ElectionInput, ElectionKind, ElectionScope } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { isSteward } from "@/lib/roles";
import { PageHeader, Empty, Select } from "@/components/ui";
import { FieldError, FlagChip, Notice, ReadOnlyNotice } from "@/components/admin-kit";
import { SettingsAuditHistory } from "@/components/settings-audit";
import { BusyLabel } from "@/components/skeleton";
import { describeError, errorCode, errorField } from "@/lib/errors";
import { addDays, formatDate, formatDateTime, todayAccra } from "@/lib/format";
import { btnDanger, btnGhost, btnPrimary, btnSecondary, btnSmall, inputCls, labelCls } from "@/lib/ui-classes";

export async function loader() {
  return api.elections();
}

const KIND_LABEL: Record<ElectionKind, string> = {
  general: "General (presidential and parliamentary)",
  parliamentary_by: "Parliamentary by-election",
  party_primary: "Party primary",
  district_assembly: "District Assembly (non-partisan)",
  referendum: "Referendum",
};
const SCOPE_LABEL: Record<ElectionScope, string> = { national: "National", region: "Region", constituency: "Constituency" };

type FieldKey = keyof ElectionInput;
type Errors = Partial<Record<FieldKey, string>>;

/** Form state: dates as YYYY-MM-DD, timestamps as "YYYY-MM-DDTHH:mm" (Accra = UTC). */
interface Form {
  name: string;
  kind: ElectionKind;
  scope: ElectionScope;
  areas: string;
  pollDate: string;
  politicalAdsFrom: string;
  blackoutStart: string;
  blackoutEnd: string;
  newsModeFrom: string;
  newsModeTo: string;
  resultsDeclaredAt: string;
  notes: string;
}

const DERIVED = ["politicalAdsFrom", "blackoutStart", "blackoutEnd", "newsModeFrom", "newsModeTo"] as const;
type Derived = (typeof DERIVED)[number];

const BLANK: Form = {
  name: "", kind: "general", scope: "national", areas: "", pollDate: "",
  politicalAdsFrom: "", blackoutStart: "", blackoutEnd: "", newsModeFrom: "", newsModeTo: "",
  resultsDeclaredAt: "", notes: "",
};

/** RFC3339 → datetime-local value in Accra (UTC). */
function toLocal(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 16);
}

/** datetime-local value (Accra) → RFC3339 UTC. */
function toIso(local: string): string {
  return local ? `${local}:00Z` : "";
}

/** The spec defaults (section 1.2, [A12]) for a poll date. */
function defaultsFor(poll: string): Pick<Form, Derived> {
  return {
    politicalAdsFrom: addDays(poll, -90),
    blackoutStart: `${addDays(poll, -1)}T00:00`,
    blackoutEnd: `${addDays(poll, 2)}T00:00`,
    newsModeFrom: addDays(poll, -30),
    newsModeTo: addDays(poll, 3),
  };
}

function toForm(e: Election): Form {
  return {
    name: e.name, kind: e.kind, scope: e.scope, areas: (e.areas ?? []).join(", "), pollDate: e.pollDate,
    politicalAdsFrom: e.politicalAdsFrom, blackoutStart: toLocal(e.blackoutStart), blackoutEnd: toLocal(e.blackoutEnd),
    newsModeFrom: e.newsModeFrom, newsModeTo: e.newsModeTo, resultsDeclaredAt: toLocal(e.resultsDeclaredAt), notes: e.notes ?? "",
  };
}

function toInput(f: Form): ElectionInput {
  const areas = f.areas.split(",").map((a) => a.trim()).filter(Boolean);
  return {
    name: f.name.trim(), kind: f.kind, scope: f.scope, areas: areas.length ? areas : undefined, pollDate: f.pollDate,
    politicalAdsFrom: f.politicalAdsFrom, blackoutStart: toIso(f.blackoutStart), blackoutEnd: toIso(f.blackoutEnd),
    newsModeFrom: f.newsModeFrom, newsModeTo: f.newsModeTo,
    resultsDeclaredAt: f.resultsDeclaredAt ? toIso(f.resultsDeclaredAt) : undefined,
    notes: f.notes.trim() || undefined,
  };
}

function validate(f: Form): Errors {
  const e: Errors = {};
  if (f.name.trim().length < 3) e.name = "Give the election a name, e.g. 2028 General Election.";
  if (!f.pollDate) e.pollDate = "Enter the poll date.";
  if (f.scope !== "national" && !f.areas.trim()) e.areas = "Name the region or constituency.";
  for (const k of DERIVED) if (!f[k]) e[k] = "Required.";
  if (f.blackoutStart && f.blackoutEnd && f.blackoutStart >= f.blackoutEnd) e.blackoutEnd = "The blackout must end after it starts.";
  if (f.politicalAdsFrom && f.blackoutStart && f.politicalAdsFrom >= f.blackoutStart.slice(0, 10)) e.politicalAdsFrom = "Political ads must open before the blackout day.";
  if (f.pollDate && f.newsModeFrom && f.newsModeFrom > f.pollDate) e.newsModeFrom = "Election mode must start on or before the poll date.";
  if (f.pollDate && f.newsModeTo && f.newsModeTo < f.pollDate) e.newsModeTo = "Election mode must end on or after the poll date.";
  return e;
}

type Phase = { label: string; tone: "gold" | "clay" | "teal" | "neutral" | "green" };

function phaseOf(e: Election, now: Date): Phase {
  const t = now.getTime();
  const today = now.toISOString().slice(0, 10);
  if (t >= Date.parse(e.blackoutStart) && t < Date.parse(e.blackoutEnd)) return { label: "Blackout now", tone: "clay" };
  if (today > e.newsModeTo && t >= Date.parse(e.blackoutEnd)) return { label: "Past", tone: "neutral" };
  if (today >= e.politicalAdsFrom && t < Date.parse(e.blackoutStart)) return { label: "Political ads open", tone: "gold" };
  if (today >= e.newsModeFrom && today <= e.newsModeTo) return { label: "Election mode", tone: "teal" };
  return { label: "Upcoming", tone: "green" };
}

/** Days since the epoch for a date or timestamp (UTC = Accra). */
function dayNo(v: string): number {
  return Math.floor(Date.parse(v.length === 10 ? `${v}T00:00:00Z` : v) / 86_400_000);
}

/** The election's windows on one line: political ads, blackout, election mode, poll day. */
function Timeline({ e }: Readonly<{ e: Election }>) {
  const start = Math.min(dayNo(e.politicalAdsFrom), dayNo(e.newsModeFrom));
  const end = Math.max(dayNo(e.newsModeTo) + 1, dayNo(e.blackoutEnd));
  const span = Math.max(1, end - start);
  const pos = (d: number) => `${((d - start) / span) * 100}%`;
  const width = (a: number, b: number) => `${(Math.max(0.6, b - a) / span) * 100}%`;
  const ads = [dayNo(e.politicalAdsFrom), dayNo(e.blackoutStart)];
  const black = [dayNo(e.blackoutStart), dayNo(e.blackoutEnd)];
  const news = [dayNo(e.newsModeFrom), dayNo(e.newsModeTo) + 1];
  const poll = dayNo(e.pollDate);
  const today = dayNo(todayAccra());
  return (
    <figure className="mt-4">
      <div className="relative h-12" aria-hidden>
        <div className="absolute inset-x-0 top-2 h-3 rounded-full bg-sand/70" />
        <div className="absolute top-2 h-3 rounded-l-full bg-gold/70" style={{ left: pos(ads[0]), width: width(ads[0], ads[1]) }} />
        <div className="absolute top-2 h-3 bg-maroon-900/80" style={{ left: pos(black[0]), width: width(black[0], black[1]) }} />
        <div className="absolute top-7 h-1.5 rounded-full bg-teal/70" style={{ left: pos(news[0]), width: width(news[0], news[1]) }} />
        <div className="absolute top-0 h-10 w-px bg-ink" style={{ left: pos(poll + 0.5) }} />
        {today >= start && today <= end && <div className="absolute top-0.5 h-9 w-0.5 rounded-full bg-green-text/70" style={{ left: pos(today) }} />}
      </div>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-gold/70" aria-hidden />Political ads {formatDate(e.politicalAdsFrom)} to {formatDateTime(e.blackoutStart)}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-maroon-900/80" aria-hidden />Blackout to {formatDateTime(e.blackoutEnd)}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-3 rounded-full bg-teal/70" aria-hidden />Election mode {formatDate(e.newsModeFrom)} to {formatDate(e.newsModeTo)}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-px bg-ink" aria-hidden />Poll day</span>
      </figcaption>
    </figure>
  );
}

function Field({ id, label, error, hint, children }: Readonly<{ id: string; label: string; error?: string; hint?: string; children: ReactNode }>) {
  return (
    <div>
      <label htmlFor={id} className={labelCls}>{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
      <FieldError id={`${id}-err`}>{error}</FieldError>
    </div>
  );
}

function ElectionForm({ initial, onCancel, onSaved }: Readonly<{ initial: Election | null; onCancel: () => void; onSaved: (e: Election) => void }>) {
  const [form, setForm] = useState<Form>(initial ? toForm(initial) : BLANK);
  const [touched, setTouched] = useState<Set<Derived>>(() => new Set(initial ? DERIVED : []));
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
    if ((DERIVED as readonly string[]).includes(k)) setTouched((t) => new Set(t).add(k as Derived));
  };

  // Poll date fills every window the steward hasn't set by hand.
  const setPoll = (poll: string) => {
    setForm((f) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(poll)) return { ...f, pollDate: poll };
      const d = defaultsFor(poll);
      const next = { ...f, pollDate: poll };
      for (const k of DERIVED) if (!touched.has(k)) next[k] = d[k];
      return next;
    });
    setErrors((e) => ({ ...e, pollDate: undefined }));
  };

  const resetDefaults = () => {
    if (!form.pollDate) return;
    setForm((f) => ({ ...f, ...defaultsFor(f.pollDate) }));
    setTouched(new Set());
  };

  async function save() {
    const v = validate(form);
    if (Object.keys(v).length) { setErrors(v); return; }
    setBusy(true);
    setError("");
    try {
      const saved = initial ? await api.updateElection(initial.id, toInput(form)) : await api.createElection(toInput(form));
      onSaved(saved);
    } catch (e) {
      const f = errorField(e) as FieldKey | undefined;
      if (f) setErrors({ [f]: "The server rejected this value." });
      setError(describeError(e, { invalid_election: "One of the dates or values isn't valid. Check the highlighted field." }, "We couldn't save the election. Try again."));
    } finally {
      setBusy(false);
    }
  }

  const err = (k: FieldKey) => errors[k];
  const aria = (k: FieldKey) => ({ "aria-invalid": Boolean(errors[k]) || undefined, "aria-describedby": errors[k] ? `el-${k}-err` : undefined });

  return (
    <motion.section
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.22 }}
      aria-labelledby="election-form-title"
      className="mb-6 rounded-[var(--radius-card)] border border-gold-border/40 bg-cream shadow-[var(--shadow-lift)]"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-sand px-5 py-4">
        <h2 id="election-form-title" className="text-base font-semibold text-ink">{initial ? `Edit ${initial.name}` : "Add an election"}</h2>
        <p className="text-xs text-ink-faint">All times are Accra time (GMT).</p>
      </header>
      <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2">
          <Field id="el-name" label="Name" error={err("name")}>
            <input id="el-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="2028 General Election" className={inputCls} {...aria("name")} />
          </Field>
        </div>
        <Field id="el-poll" label="Poll date" error={err("pollDate")} hint="The windows below fill in from this date.">
          <input id="el-poll" type="date" value={form.pollDate} onChange={(e) => setPoll(e.target.value)} className={`${inputCls} tabular-nums`} {...aria("pollDate")} />
        </Field>
        <Field id="el-kind" label="Kind">
          <Select id="el-kind" value={form.kind} onValueChange={(v) => set("kind", v as ElectionKind)} className="w-full">
            {(Object.keys(KIND_LABEL) as ElectionKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </Select>
        </Field>
        <Field id="el-scope" label="Scope">
          <Select id="el-scope" value={form.scope} onValueChange={(v) => set("scope", v as ElectionScope)} className="w-full">
            {(Object.keys(SCOPE_LABEL) as ElectionScope[]).map((k) => <option key={k} value={k}>{SCOPE_LABEL[k]}</option>)}
          </Select>
        </Field>
        <Field id="el-areas" label="Areas" error={err("areas")} hint="Comma-separated, e.g. Cape Coast North, Cape Coast South">
          <input id="el-areas" value={form.areas} onChange={(e) => set("areas", e.target.value)} disabled={form.scope === "national"} placeholder={form.scope === "national" ? "Whole country" : "Cape Coast North"} className={inputCls} {...aria("areas")} />
        </Field>

        <div className="flex items-end justify-between gap-3 border-t border-sand pt-4 sm:col-span-2 lg:col-span-3">
          <p className="text-sm font-semibold text-ink">Windows</p>
          <button type="button" onClick={resetDefaults} disabled={!form.pollDate} className={`${btnGhost} ${btnSmall}`}>Reset to defaults</button>
        </div>
        <Field id="el-politicalAdsFrom" label="Political ads from" error={err("politicalAdsFrom")} hint="Default: 90 days before the poll">
          <input id="el-politicalAdsFrom" type="date" value={form.politicalAdsFrom} onChange={(e) => set("politicalAdsFrom", e.target.value)} className={`${inputCls} tabular-nums`} {...aria("politicalAdsFrom")} />
        </Field>
        <Field id="el-blackoutStart" label="Blackout starts" error={err("blackoutStart")} hint="Default: 00:00 the day before the poll">
          <input id="el-blackoutStart" type="datetime-local" value={form.blackoutStart} onChange={(e) => set("blackoutStart", e.target.value)} className={`${inputCls} tabular-nums`} {...aria("blackoutStart")} />
        </Field>
        <Field id="el-blackoutEnd" label="Blackout ends" error={err("blackoutEnd")} hint="Default: 00:00 two days after; shorten once results are declared">
          <input id="el-blackoutEnd" type="datetime-local" value={form.blackoutEnd} onChange={(e) => set("blackoutEnd", e.target.value)} className={`${inputCls} tabular-nums`} {...aria("blackoutEnd")} />
        </Field>
        <Field id="el-newsModeFrom" label="Newsroom election mode from" error={err("newsModeFrom")} hint="Default: 30 days before the poll">
          <input id="el-newsModeFrom" type="date" value={form.newsModeFrom} onChange={(e) => set("newsModeFrom", e.target.value)} className={`${inputCls} tabular-nums`} {...aria("newsModeFrom")} />
        </Field>
        <Field id="el-newsModeTo" label="Newsroom election mode to" error={err("newsModeTo")} hint="Default: 3 days after the poll">
          <input id="el-newsModeTo" type="date" value={form.newsModeTo} onChange={(e) => set("newsModeTo", e.target.value)} className={`${inputCls} tabular-nums`} {...aria("newsModeTo")} />
        </Field>
        <Field id="el-results" label="Results declared (optional)" error={err("resultsDeclaredAt")}>
          <input id="el-results" type="datetime-local" value={form.resultsDeclaredAt} onChange={(e) => set("resultsDeclaredAt", e.target.value)} className={`${inputCls} tabular-nums`} {...aria("resultsDeclaredAt")} />
        </Field>
        <div className="sm:col-span-2 lg:col-span-3">
          <Field id="el-notes" label="Notes (optional)">
            <textarea id="el-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} maxLength={1000} placeholder="Source of the dates, EC notice reference…" className={inputCls} />
          </Field>
        </div>
      </div>
      <footer className="flex flex-wrap items-center gap-3 border-t border-sand px-5 py-4">
        <button type="button" onClick={save} disabled={busy} className={btnPrimary}>
          {busy ? <BusyLabel label="Saving election" tone="dark" /> : initial ? "Save changes" : "Add election"}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className={btnSecondary}>Cancel</button>
        {error && <p role="alert" className="text-sm text-clay-text">{error}</p>}
      </footer>
    </motion.section>
  );
}

function DeleteControl({ election, inUse, onDeleted, onInUse }: Readonly<{ election: Election; inUse: boolean; onDeleted: () => void; onInUse: () => void }>) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (inUse) {
    return (
      <div className="flex flex-col items-start gap-1 sm:items-end">
        <button type="button" disabled className={`${btnSecondary} ${btnSmall}`}>Delete</button>
        <p className="max-w-[18rem] text-xs leading-relaxed text-clay-text sm:text-right">Political ads still reference this election. Delete it after those campaigns finish.</p>
      </div>
    );
  }
  async function remove() {
    setBusy(true);
    setError("");
    try {
      await api.deleteElection(election.id);
      onDeleted();
    } catch (e) {
      if (errorCode(e) === "election_in_use") onInUse();
      else setError(describeError(e, {}, "We couldn't delete the election. Try again."));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      {confirming ? (
        <span className="inline-flex items-center gap-1">
          <button type="button" onClick={remove} disabled={busy} className={`${btnDanger} ${btnSmall}`}>{busy ? <BusyLabel label="Deleting election" tone="dark" width="w-10" /> : "Delete election"}</button>
          <button type="button" onClick={() => setConfirming(false)} disabled={busy} className={`${btnGhost} ${btnSmall}`}>Keep</button>
        </span>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className={`${btnSecondary} ${btnSmall}`}>Delete</button>
      )}
      {error && <p role="alert" className="text-xs text-clay-text">{error}</p>}
    </div>
  );
}

function ElectionCard({ e, canEdit, inUse, onEdit, onDeleted, onInUse }: Readonly<{ e: Election; canEdit: boolean; inUse: boolean; onEdit: () => void; onDeleted: () => void; onInUse: () => void }>) {
  const phase = phaseOf(e, new Date());
  const [y, , d] = e.pollDate.split("-");
  const month = new Date(`${e.pollDate}T00:00:00Z`).toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  return (
    <article className="rounded-[var(--radius-card)] border border-sand bg-cream p-5 shadow-[var(--shadow-card)] transition-shadow duration-300 hover:shadow-[var(--shadow-lift)]">
      <div className="flex flex-wrap items-start gap-5">
        <div className="grid w-[4.5rem] shrink-0 place-items-center rounded-[10px] border border-gold-border/35 bg-paper py-2 text-center" aria-label={`Poll day ${formatDate(e.pollDate)}`}>
          <span className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-gold-text">{month}</span>
          <span className="text-3xl font-semibold leading-none tracking-[-0.03em] tabular-nums text-ink">{Number(d)}</span>
          <span className="text-[0.7rem] tabular-nums text-ink-faint">{y}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold tracking-[-0.01em] text-ink [text-wrap:balance]">{e.name}</h3>
            <FlagChip tone={phase.tone}>{phase.label}</FlagChip>
          </div>
          <p className="mt-0.5 text-sm text-ink-muted">
            {KIND_LABEL[e.kind]} · {SCOPE_LABEL[e.scope]}{e.areas?.length ? `: ${e.areas.join(", ")}` : ""}
          </p>
          {e.resultsDeclaredAt && <p className="mt-0.5 text-xs text-ink-faint">Results declared {formatDateTime(e.resultsDeclaredAt)}</p>}
          {e.notes && <p className="mt-1.5 max-w-[65ch] text-sm leading-relaxed text-ink-muted [text-wrap:pretty]">{e.notes}</p>}
        </div>
        {canEdit && (
          <div className="flex w-full flex-wrap items-start gap-2 sm:w-auto sm:flex-col sm:items-end">
            <button type="button" onClick={onEdit} className={`${btnSecondary} ${btnSmall}`}>Edit</button>
            <DeleteControl election={e} inUse={inUse} onDeleted={onDeleted} onInUse={onInUse} />
          </div>
        )}
      </div>
      <Timeline e={e} />
    </article>
  );
}

export function Component() {
  const loaded = useLoaderData() as Election[];
  const { member } = useAuth();
  const canEdit = isSteward(member?.role);
  const [elections, setElections] = useState<Election[]>(loaded ?? []);
  const [editing, setEditing] = useState<Election | "new" | null>(null);
  const [inUse, setInUse] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState("");
  const [auditKey, setAuditKey] = useState(0);

  const { upcoming, past } = useMemo(() => {
    const today = todayAccra();
    const sorted = [...elections].sort((a, b) => b.pollDate.localeCompare(a.pollDate));
    return {
      upcoming: sorted.filter((e) => e.newsModeTo >= today).reverse(),
      past: sorted.filter((e) => e.newsModeTo < today),
    };
  }, [elections]);

  function saved(e: Election) {
    setElections((cur) => [...cur.filter((x) => x.id !== e.id), e]);
    setNotice(editing === "new" ? `${e.name} added to the calendar.` : `${e.name} saved.`);
    setEditing(null);
    setAuditKey((k) => k + 1);
  }

  function deleted(e: Election) {
    setElections((cur) => cur.filter((x) => x.id !== e.id));
    setNotice(`${e.name} deleted.`);
    setAuditKey((k) => k + 1);
  }

  const card = (e: Election) => (
    <ElectionCard
      key={e.id}
      e={e}
      canEdit={canEdit}
      inUse={inUse.has(e.id)}
      onEdit={() => { setEditing(e); setNotice(""); }}
      onDeleted={() => deleted(e)}
      onInUse={() => setInUse((s) => new Set(s).add(e.id))}
    />
  );

  return (
    <>
      <PageHeader
        tone="green"
        kicker="Elections"
        title="Election calendar"
        lede="One calendar drives both features: when political ads may run, the blackout that pauses every political ad, and when the newsroom switches to election mode."
      >
        {canEdit && !editing && (
          <button type="button" onClick={() => { setEditing("new"); setNotice(""); }} className={btnPrimary}>Add election</button>
        )}
      </PageHeader>

      {!canEdit && <div className="mb-5"><ReadOnlyNotice>Only the steward can add or change elections.</ReadOnlyNotice></div>}
      {notice && <div className="mb-5"><Notice tone="ok" onDismiss={() => setNotice("")}>{notice}</Notice></div>}

      <AnimatePresence initial={false}>
        {editing && (
          <ElectionForm
            key={editing === "new" ? "new" : editing.id}
            initial={editing === "new" ? null : editing}
            onCancel={() => setEditing(null)}
            onSaved={saved}
          />
        )}
      </AnimatePresence>

      {elections.length === 0 ? (
        <Empty
          icon="calendar"
          title="No elections on the calendar"
          actions={canEdit && !editing ? <button type="button" onClick={() => setEditing("new")} className={btnPrimary}>Add the first election</button> : undefined}
        >
          Until an election is added, political ads have no window to run in and the newsroom stays out of election mode unless it is switched on by hand.
        </Empty>
      ) : (
        <div className="space-y-8">
          <section aria-labelledby="upcoming-title">
            <h2 id="upcoming-title" className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-ink-faint">Upcoming and current</h2>
            {upcoming.length ? <div className="space-y-4">{upcoming.map(card)}</div> : <p className="text-sm text-ink-muted">No upcoming elections.</p>}
          </section>
          {past.length > 0 && (
            <section aria-labelledby="past-title">
              <h2 id="past-title" className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-ink-faint">Past</h2>
              <div className="space-y-4 opacity-90">{past.map(card)}</div>
            </section>
          )}
        </div>
      )}

      <div className="mt-8">
        <SettingsAuditHistory settingsKey="elections" refreshKey={auditKey} />
      </div>
    </>
  );
}
