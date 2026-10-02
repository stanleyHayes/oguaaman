import { useState, type ReactNode } from "react";
import { Link, useLoaderData } from "react-router-dom";
import { api } from "@/lib/api";
import type { NewsDeskSettings, NewsDeskSettingsView } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { isSteward } from "@/lib/roles";
import { PageHeader } from "@/components/ui";
import { FieldError, KeyIndicator, Notice, Panel, ReadOnlyNotice, Toggle } from "@/components/admin-kit";
import { SettingsAuditHistory } from "@/components/settings-audit";
import { BusyLabel } from "@/components/skeleton";
import { describeError, errorCode, errorField, SETTINGS_ERRORS } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { btnPrimary, btnSecondary, inputCls, labelCls } from "@/lib/ui-classes";

export async function loader() {
  return api.newsDeskSettings();
}

/** Form state: numbers as typed strings, USD (not micro-USD) for money. */
interface Form {
  deskEnabled: boolean;
  briefAutoPublish: boolean;
  longformEnabled: boolean;
  imagesEnabled: boolean;
  electionModeManual: boolean;
  maxReportsPerDay: string;
  researchUsd: string;
  maxImagesPerDay: string;
  imageUsd: string;
  minSources: string;
  maxQuoteWords: string;
  keywords: string[];
}

type NumField = "maxReportsPerDay" | "researchUsd" | "maxImagesPerDay" | "imageUsd" | "minSources" | "maxQuoteWords";

interface NumSpec { key: NumField; label: string; hint: string; min: number; max: number; money?: boolean; apiField: string }

const CAPS: readonly NumSpec[] = [
  { key: "maxReportsPerDay", label: "Reports per day", hint: "0 to 20", min: 0, max: 20, apiField: "maxReportsPerDay" },
  { key: "researchUsd", label: "Research spend per day (USD)", hint: "$0 to $50; each research call needs $2 of room to start", min: 0, max: 50, money: true, apiField: "maxResearchMicroUsdPerDay" },
  { key: "maxImagesPerDay", label: "Illustrations per day", hint: "0 to 50", min: 0, max: 50, apiField: "maxImagesPerDay" },
  { key: "imageUsd", label: "Image spend per day (USD)", hint: "$0 to $10", min: 0, max: 10, money: true, apiField: "maxImageMicroUsdPerDay" },
];

const QUALITY: readonly NumSpec[] = [
  { key: "minSources", label: "Minimum distinct publishers", hint: "2 to 5", min: 2, max: 5, apiField: "minSources" },
  { key: "maxQuoteWords", label: "Longest quote (words)", hint: "10 to 25", min: 10, max: 25, apiField: "maxQuoteWords" },
];

const KEYWORD_LIMIT = 100;

function toForm(s: NewsDeskSettings): Form {
  return {
    deskEnabled: s.deskEnabled,
    briefAutoPublish: s.briefAutoPublish,
    longformEnabled: s.longformEnabled,
    imagesEnabled: s.imagesEnabled,
    electionModeManual: s.electionModeManual,
    maxReportsPerDay: String(s.maxReportsPerDay),
    researchUsd: (s.maxResearchMicroUsdPerDay / 1_000_000).toString(),
    maxImagesPerDay: String(s.maxImagesPerDay),
    imageUsd: (s.maxImageMicroUsdPerDay / 1_000_000).toString(),
    minSources: String(s.minSources),
    maxQuoteWords: String(s.maxQuoteWords),
    keywords: s.extraBlockedKeywords ?? [],
  };
}

function toSettings(f: Form, base: NewsDeskSettings): NewsDeskSettings {
  return {
    ...base,
    deskEnabled: f.deskEnabled,
    briefAutoPublish: f.briefAutoPublish,
    longformEnabled: f.longformEnabled,
    imagesEnabled: f.imagesEnabled,
    electionModeManual: f.electionModeManual,
    maxReportsPerDay: Number.parseInt(f.maxReportsPerDay, 10),
    maxResearchMicroUsdPerDay: Math.round(Number.parseFloat(f.researchUsd) * 1_000_000),
    maxImagesPerDay: Number.parseInt(f.maxImagesPerDay, 10),
    maxImageMicroUsdPerDay: Math.round(Number.parseFloat(f.imageUsd) * 1_000_000),
    minSources: Number.parseInt(f.minSources, 10),
    maxQuoteWords: Number.parseInt(f.maxQuoteWords, 10),
    extraBlockedKeywords: f.keywords,
  };
}

/** Client-side range checks; the server re-validates (400 invalid_setting). */
function validate(f: Form): Partial<Record<NumField, string>> {
  const errors: Partial<Record<NumField, string>> = {};
  for (const spec of [...CAPS, ...QUALITY]) {
    const raw = f[spec.key].trim();
    const n = spec.money ? Number.parseFloat(raw) : Number(raw);
    if (raw === "" || Number.isNaN(n)) errors[spec.key] = "Enter a number.";
    else if (!spec.money && !Number.isInteger(n)) errors[spec.key] = "Use a whole number.";
    else if (n < spec.min || n > spec.max) errors[spec.key] = `Use ${spec.hint.split(";")[0]}.`;
  }
  return errors;
}

function NumInput({ spec, form, set, error, disabled }: Readonly<{ spec: NumSpec; form: Form; set: (k: NumField, v: string) => void; error?: string; disabled: boolean }>) {
  const id = `desk-${spec.key}`;
  return (
    <div>
      <label htmlFor={id} className={labelCls}>{spec.label}</label>
      <div className="relative">
        {spec.money && <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-faint">$</span>}
        <input
          id={id}
          value={form[spec.key]}
          onChange={(e) => set(spec.key, e.target.value)}
          inputMode={spec.money ? "decimal" : "numeric"}
          disabled={disabled}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={`${id}-hint${error ? ` ${id}-err` : ""}`}
          className={`${inputCls} tabular-nums ${spec.money ? "pl-7" : ""}`}
        />
      </div>
      <p id={`${id}-hint`} className="mt-1 text-xs text-ink-faint">{spec.hint}</p>
      <FieldError id={`${id}-err`}>{error}</FieldError>
    </div>
  );
}

function KeywordEditor({ keywords, onChange, disabled, error }: Readonly<{ keywords: string[]; onChange: (next: string[]) => void; disabled: boolean; error?: string }>) {
  const [draft, setDraft] = useState("");
  const [local, setLocal] = useState("");
  function add() {
    const k = draft.trim().toLowerCase();
    if (!k) return;
    if (k.length < 2 || k.length > 40) { setLocal("Keywords are 2 to 40 characters."); return; }
    if (keywords.includes(k)) { setLocal("That keyword is already on the list."); return; }
    if (keywords.length >= KEYWORD_LIMIT) { setLocal(`The list holds up to ${KEYWORD_LIMIT} keywords.`); return; }
    onChange([...keywords, k]);
    setDraft("");
    setLocal("");
  }
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {keywords.length === 0 && <p className="text-sm text-ink-faint">No extra keywords. The built-in list still applies.</p>}
        {keywords.map((k) => (
          <span key={k} className="inline-flex items-center gap-1 rounded-[6px] border border-sand bg-paper py-1 pl-2.5 pr-1 text-xs font-medium text-ink">
            {k}
            {!disabled && (
              <button type="button" onClick={() => onChange(keywords.filter((x) => x !== k))} aria-label={`Remove ${k}`} className="grid size-6 place-items-center rounded-full text-ink-faint transition-colors hover:bg-sand hover:text-maroon-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60">×</button>
            )}
          </span>
        ))}
      </div>
      {!disabled && (
        <div className="mt-3 flex gap-2">
          <label htmlFor="desk-keyword" className="sr-only">Add a blocked keyword</label>
          <input
            id="desk-keyword"
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setLocal(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            placeholder="e.g. land dispute"
            maxLength={40}
            className={`${inputCls} max-w-xs`}
          />
          <button type="button" onClick={add} className={btnSecondary}>Add</button>
        </div>
      )}
      <FieldError>{local || error}</FieldError>
      <p className="mt-2 text-xs text-ink-faint tabular-nums">{keywords.length} of {KEYWORD_LIMIT}. Leads matching any keyword stay as briefs and are never drafted by AI.</p>
    </div>
  );
}

function StatusAside({ view }: Readonly<{ view: NewsDeskSettingsView }>) {
  let election: ReactNode;
  if (view.electionModeActive) {
    election = (
      <div className="rounded-xl border border-clay/30 bg-clay/[0.08] p-3.5">
        <p className="text-sm font-semibold text-clay-text">Election mode is on</p>
        <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">
          {view.electionModeManual ? "Switched on by hand." : "Set by the election calendar."} Political leads are not drafted, and covers are branded.
        </p>
      </div>
    );
  } else {
    election = (
      <div className="rounded-xl border border-sand bg-paper p-3.5">
        <p className="text-sm font-semibold text-ink">Election mode is off</p>
        <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">It turns on from the <Link to="/elections" className="font-medium text-green-text underline underline-offset-4">election calendar</Link> or the switch on this page.</p>
      </div>
    );
  }
  return (
    <aside className="space-y-5">
      <Panel title="Desk status">
        <div className="divide-y divide-sand">
          <KeyIndicator label="Anthropic" on={view.keys.anthropic} detail="Researches and drafts reports. Without it no reports are drafted." />
          <KeyIndicator label="OpenAI images" on={view.keys.openai} detail="Draws illustrations. Without it every cover is branded." />
          <KeyIndicator label="Cloudinary" on={view.keys.cloudinary} detail="Stores illustrations. Without it every cover is branded." />
        </div>
        <div className="mt-4">{election}</div>
      </Panel>
      <section className="rounded-[var(--radius-card)] border border-ai-line bg-ai-tint p-5">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-ai">Always held</p>
        <p className="mt-2 text-sm leading-relaxed text-ink [text-wrap:pretty]">
          AI-written reports always wait for an editor in the <Link to="/newsroom/research" className="font-semibold underline underline-offset-4">research queue</Link>. No setting publishes them automatically.
        </p>
      </section>
    </aside>
  );
}

export function Component() {
  const loaded = useLoaderData() as NewsDeskSettingsView;
  const { member } = useAuth();
  const canEdit = isSteward(member?.role);
  const [base, setBase] = useState<NewsDeskSettingsView>(loaded);
  const [form, setForm] = useState<Form>(() => toForm(loaded));
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Partial<Record<NumField | "reason" | "keywords", string>>>({});
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string; conflict?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [auditKey, setAuditKey] = useState(0);

  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(base));
  const setNum = (k: NumField, v: string) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };
  const setBool = (k: keyof Form) => (v: boolean) => setForm((f) => ({ ...f, [k]: v }));

  async function reload() {
    setNotice(null);
    try {
      const fresh = await api.newsDeskSettings();
      setBase(fresh);
      setForm(toForm(fresh));
      setErrors({});
    } catch (e) {
      setNotice({ tone: "error", text: describeError(e, {}, "We couldn't reload the settings. Try again.") });
    }
  }

  async function save() {
    const fieldErrors = validate(form);
    const reasonError = reason.trim().length < 5 ? "Say why you're making this change (at least 5 characters)." : undefined;
    if (Object.keys(fieldErrors).length > 0 || reasonError) {
      setErrors({ ...fieldErrors, reason: reasonError });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const saved = await api.saveNewsDeskSettings(toSettings(form, base), reason.trim());
      const next = { ...base, ...saved };
      setBase(next);
      setForm(toForm(next));
      setReason("");
      setErrors({});
      setAuditKey((k) => k + 1);
      setNotice({ tone: "ok", text: "Desk settings saved. The desk picks them up within 30 seconds." });
    } catch (e) {
      const field = errorField(e);
      const spec = [...CAPS, ...QUALITY].find((s) => s.apiField === field);
      if (spec) setErrors({ [spec.key]: "The server rejected this value. Check the range." });
      if (field === "extraBlockedKeywords") setErrors({ keywords: "One of the keywords is not allowed. Keywords are 2 to 40 characters." });
      setNotice({ tone: "error", text: describeError(e, SETTINGS_ERRORS, "We couldn't save the desk settings. Try again."), conflict: errorCode(e) === "settings_conflict" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        kicker="Newsroom · AI desk"
        title="Desk settings"
        lede="Switches and daily caps for the automated news desk. Briefs come from trusted feeds; long-form reports are researched and drafted by AI, then held for an editor."
      />

      {!canEdit && <div className="mb-5"><ReadOnlyNotice>Only the steward can change these settings. You can see what is in force.</ReadOnlyNotice></div>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <Panel title="Switches" aside="The desk applies a change within 30 seconds.">
            <div className="divide-y divide-sand">
              <Toggle label="News desk" checked={form.deskEnabled} onChange={setBool("deskEnabled")} disabled={!canEdit} description="Master switch for the feed pass and the research worker. Off stops all automated news." />
              <Toggle label="Publish briefs automatically" checked={form.briefAutoPublish} onChange={setBool("briefAutoPublish")} disabled={!canEdit} description="Briefs are the feed's own teaser with a link to the source. Political briefs are always held as drafts." />
              <Toggle label="Draft long-form reports" checked={form.longformEnabled} onChange={setBool("longformEnabled")} disabled={!canEdit} description="Research eligible briefs and draft a 300 to 700 word report from at least two publishers. Every report waits for an editor." />
              <Toggle label="AI illustrations" checked={form.imagesEnabled} onChange={setBool("imagesEnabled")} disabled={!canEdit} description="Draw an illustration for non-political, non-sensitive reports. Off means a branded cover for every report." />
              <Toggle label="Election mode (manual)" checked={form.electionModeManual} onChange={setBool("electionModeManual")} disabled={!canEdit} description="Forces election mode on, on top of the calendar: AI drafts no political story and no AI-assisted political report can be published. Branded covers only." />
            </div>
          </Panel>

          <Panel title="Daily caps" aside="Checked before every Claude and image call: a call starts only if its estimated cost still fits. Counted per Accra day.">
            <div className="grid gap-4 sm:grid-cols-2">
              {CAPS.map((spec) => <NumInput key={spec.key} spec={spec} form={form} set={setNum} error={errors[spec.key]} disabled={!canEdit} />)}
            </div>
          </Panel>

          <Panel title="Quality bar" aside="Drafts that miss these fail before an editor sees them.">
            <div className="grid gap-4 sm:grid-cols-2">
              {QUALITY.map((spec) => <NumInput key={spec.key} spec={spec} form={form} set={setNum} error={errors[spec.key]} disabled={!canEdit} />)}
            </div>
          </Panel>

          <Panel title="Extra blocked keywords" aside="Added to the built-in list: courts, crime and police, conflict, accidents, fires and deaths, chieftaincy disputes, outbreaks, children and students, and election results. Plurals match too. The built-in list can't be removed.">
            <KeywordEditor keywords={form.keywords} onChange={(next) => { setForm((f) => ({ ...f, keywords: next })); setErrors((e) => ({ ...e, keywords: undefined })); }} disabled={!canEdit} error={errors.keywords} />
          </Panel>

          {canEdit && (
            <section aria-label="Save changes" className="sticky bottom-4 z-10 rounded-[var(--radius-card)] border border-sand bg-cream/95 p-4 shadow-[var(--shadow-lift)] backdrop-blur">
              {notice && (
                <div className="mb-3">
                  <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
                    {notice.text}
                    {notice.conflict && <button type="button" onClick={reload} className="ml-2 font-semibold underline underline-offset-4">Reload</button>}
                  </Notice>
                </div>
              )}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <label htmlFor="desk-reason" className={labelCls}>Reason for the change (required)</label>
                  <input
                    id="desk-reason"
                    value={reason}
                    onChange={(e) => { setReason(e.target.value); setErrors((er) => ({ ...er, reason: undefined })); }}
                    placeholder="e.g. Raise the research cap for the festival week"
                    maxLength={300}
                    aria-invalid={Boolean(errors.reason) || undefined}
                    aria-describedby={errors.reason ? "desk-reason-err" : undefined}
                    className={inputCls}
                  />
                  <FieldError id="desk-reason-err">{errors.reason}</FieldError>
                </div>
                <div className="flex items-center gap-2 sm:pt-5">
                  <button type="button" onClick={() => { setForm(toForm(base)); setErrors({}); }} disabled={!dirty || busy} className={btnSecondary}>Discard</button>
                  <button type="button" onClick={save} disabled={!dirty || busy} className={btnPrimary}>
                    {busy ? <BusyLabel label="Saving desk settings" tone="dark" /> : "Save settings"}
                  </button>
                </div>
              </div>
            </section>
          )}

          <p className="text-xs text-ink-faint">
            Version <span className="tabular-nums">{base.version}</span>
            {base.updatedAt ? <> · last saved {formatDateTime(base.updatedAt)}{base.updatedByName ? ` by ${base.updatedByName}` : ""}</> : " · defaults in force"}
          </p>
        </div>

        <StatusAside view={base} />
      </div>

      <div className="mt-6">
        <SettingsAuditHistory settingsKey="news_desk" refreshKey={auditKey} />
      </div>
    </>
  );
}
