import { useId, useState } from "react";
import { useLoaderData } from "react-router-dom";
import { api } from "@/lib/api";
import type { AdPlacementPrice, AdPlacementSlug, AdSettings, AdSettingsView } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { isSteward } from "@/lib/roles";
import { PageHeader } from "@/components/ui";
import { FieldError, KeyIndicator, Notice, Panel, ReadOnlyNotice, Toggle } from "@/components/admin-kit";
import { SettingsAuditHistory } from "@/components/settings-audit";
import { BusyLabel } from "@/components/skeleton";
import { ADMIN_BLOCKABLE, PLACEMENTS, placementMeta } from "@/lib/ads";
import { count, formatDateTime } from "@/lib/format";
import { describeError, errorCode, errorField, SETTINGS_ERRORS } from "@/lib/errors";
import { btnPrimary, btnSecondary, inputCls, labelCls, tableHeadCls } from "@/lib/ui-classes";

export async function loader() {
  return api.adSettings();
}

interface PlacementRow { slug: AdPlacementSlug; active: boolean; cpm: string; politicalCpm: string; fallback: string }

interface Form {
  adsEnabled: boolean;
  politicalEnabled: boolean;
  appDeliveryEnabled: boolean;
  allowDistrictAssembly: boolean;
  taxPercent: string;
  taxLabel: string;
  minOrder: string;
  minImpressions: string;
  impressionStep: string;
  maxImpressionsPerOrder: string;
  maxCampaignDays: string;
  minLeadDays: string;
  approvalValidHours: string;
  sellThroughPercent: string;
  blocked: string[];
  placements: PlacementRow[];
}

type NumKey = "taxPercent" | "minOrder" | "minImpressions" | "impressionStep" | "maxImpressionsPerOrder" | "maxCampaignDays" | "minLeadDays" | "approvalValidHours" | "sellThroughPercent";

interface NumSpec { key: NumKey; apiField: keyof AdSettings; label: string; hint: string; min: number; max: number; decimal?: boolean; unit?: string }

const NUMBERS: readonly NumSpec[] = [
  { key: "minOrder", apiField: "minOrderPesewas", label: "Minimum order (GH₵, incl. tax)", hint: "Compared with the total", min: 1, max: 100_000, decimal: true, unit: "GH₵" },
  { key: "minImpressions", apiField: "minImpressions", label: "Minimum impressions", hint: "Per order", min: 1000, max: 1_000_000 },
  { key: "impressionStep", apiField: "impressionStep", label: "Impression step", hint: "Orders are multiples of this", min: 100, max: 100_000 },
  { key: "maxImpressionsPerOrder", apiField: "maxImpressionsPerOrder", label: "Maximum impressions", hint: "Per order", min: 1000, max: 10_000_000 },
  { key: "maxCampaignDays", apiField: "maxCampaignDays", label: "Longest campaign (days)", hint: "1 to 180", min: 1, max: 180 },
  { key: "minLeadDays", apiField: "minLeadDays", label: "Review lead time (days)", hint: "0 to 14; earliest start after submitting", min: 0, max: 14 },
  { key: "approvalValidHours", apiField: "approvalValidHours", label: "Approval valid for (hours)", hint: "24 to 336; unpaid approvals expire after this", min: 24, max: 336 },
  { key: "sellThroughPercent", apiField: "sellThroughPercent", label: "Sell-through (%)", hint: "10 to 100; share of forecast views we sell", min: 10, max: 100 },
  { key: "taxPercent", apiField: "taxRateBps", label: "Tax rate (%)", hint: "0 to 50. Set only once VAT registration is confirmed", min: 0, max: 50, decimal: true, unit: "%" },
];

const CEDI_MIN = 1;
const CEDI_MAX = 1000;

const toCedis = (p: number) => String(p / 100);
const toPesewas = (v: string) => Math.round(Number.parseFloat(v) * 100);

function toForm(s: AdSettings): Form {
  const rows = PLACEMENTS.map((meta) => {
    const p = s.placements.find((x) => x.slug === meta.slug);
    return { slug: meta.slug, active: p?.active ?? false, cpm: toCedis(p?.cpmPesewas ?? 0), politicalCpm: toCedis(p?.politicalCpmPesewas ?? 0), fallback: String(p?.fallbackDailyViews ?? 0) };
  });
  return {
    adsEnabled: s.adsEnabled, politicalEnabled: s.politicalEnabled, appDeliveryEnabled: s.appDeliveryEnabled, allowDistrictAssembly: s.allowDistrictAssembly,
    taxPercent: String(s.taxRateBps / 100), taxLabel: s.taxLabel,
    minOrder: toCedis(s.minOrderPesewas), minImpressions: String(s.minImpressions), impressionStep: String(s.impressionStep),
    maxImpressionsPerOrder: String(s.maxImpressionsPerOrder), maxCampaignDays: String(s.maxCampaignDays), minLeadDays: String(s.minLeadDays),
    approvalValidHours: String(s.approvalValidHours), sellThroughPercent: String(s.sellThroughPercent),
    blocked: s.blockedCategories ?? [], placements: rows,
  };
}

function toSettings(f: Form, base: AdSettings): AdSettings {
  const int = (v: string) => Number.parseInt(v, 10);
  const placements: AdPlacementPrice[] = f.placements.map((r) => ({
    slug: r.slug, active: r.active, cpmPesewas: toPesewas(r.cpm), politicalCpmPesewas: toPesewas(r.politicalCpm), fallbackDailyViews: int(r.fallback),
  }));
  return {
    ...base,
    adsEnabled: f.adsEnabled, politicalEnabled: f.politicalEnabled, appDeliveryEnabled: f.appDeliveryEnabled, allowDistrictAssembly: f.allowDistrictAssembly,
    taxRateBps: Math.round(Number.parseFloat(f.taxPercent) * 100), taxLabel: f.taxLabel.trim(),
    minOrderPesewas: toPesewas(f.minOrder), minImpressions: int(f.minImpressions), impressionStep: int(f.impressionStep),
    maxImpressionsPerOrder: int(f.maxImpressionsPerOrder), maxCampaignDays: int(f.maxCampaignDays), minLeadDays: int(f.minLeadDays),
    approvalValidHours: int(f.approvalValidHours), sellThroughPercent: int(f.sellThroughPercent),
    blockedCategories: f.blocked, placements,
  };
}

type Errors = Partial<Record<NumKey | "taxLabel" | "reason", string>> & { rows?: Record<number, string> };

function checkNumber(raw: string, min: number, max: number, decimal: boolean): string | undefined {
  const v = raw.trim();
  const n = Number(v);
  if (v === "" || Number.isNaN(n)) return "Enter a number.";
  if (!decimal && !Number.isInteger(n)) return "Use a whole number.";
  if (n < min || n > max) return `Use ${count(min)} to ${count(max)}.`;
  return undefined;
}

function rowError(r: PlacementRow): string | undefined {
  const cpm = checkNumber(r.cpm, CEDI_MIN, CEDI_MAX, true);
  if (cpm) return `CPM: ${cpm}`;
  const pol = checkNumber(r.politicalCpm, CEDI_MIN, CEDI_MAX, true);
  if (pol) return `Political CPM: ${pol}`;
  if (Number(r.politicalCpm) < Number(r.cpm)) return "Political CPM must be at least the commercial CPM.";
  return checkNumber(r.fallback, 0, 1_000_000, false) ? "Fallback views: use 0 to 1,000,000." : undefined;
}

function validate(f: Form): Errors {
  const e: Errors = {};
  for (const spec of NUMBERS) {
    const msg = checkNumber(f[spec.key], spec.min, spec.max, Boolean(spec.decimal));
    if (msg) e[spec.key] = msg;
  }
  if (!e.minImpressions && !e.maxImpressionsPerOrder && Number(f.minImpressions) > Number(f.maxImpressionsPerOrder)) e.maxImpressionsPerOrder = "Must be at least the minimum.";
  if (!e.minImpressions && !e.impressionStep && Number(f.minImpressions) % Number(f.impressionStep) !== 0) e.minImpressions = "Must be a multiple of the step.";
  if (f.taxLabel.trim().length < 2) e.taxLabel = "Name the tax as it should appear on quotes.";
  const rows: Record<number, string> = {};
  f.placements.forEach((r, i) => { const m = rowError(r); if (m) rows[i] = m; });
  if (Object.keys(rows).length) e.rows = rows;
  return e;
}

function NumField({ spec, value, onChange, error, disabled }: Readonly<{ spec: NumSpec; value: string; onChange: (v: string) => void; error?: string; disabled: boolean }>) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={labelCls}>{spec.label}</label>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} inputMode={spec.decimal ? "decimal" : "numeric"} disabled={disabled}
        aria-invalid={Boolean(error) || undefined} aria-describedby={`${id}-h${error ? ` ${id}-e` : ""}`} className={`${inputCls} tabular-nums`} />
      <p id={`${id}-h`} className="mt-1 text-xs text-ink-faint">{spec.hint}</p>
      <FieldError id={`${id}-e`}>{error}</FieldError>
    </div>
  );
}

function MiniSwitch({ checked, onChange, label, disabled }: Readonly<{ checked: boolean; onChange: (v: boolean) => void; label: string; disabled: boolean }>) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border transition-[background-color,border-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 disabled:cursor-not-allowed disabled:opacity-55 ${checked ? "border-green bg-green" : "border-sand bg-sand/70"}`}>
      <span aria-hidden className={`absolute left-0.5 h-[1.125rem] w-[1.125rem] rounded-full bg-paper shadow-[0_2px_6px_color-mix(in_oklab,var(--color-green-900)_25%,transparent)] transition-transform duration-200 ${checked ? "translate-x-4" : ""}`} />
    </button>
  );
}

function PlacementsTable({ form, view, setRow, rowErrors, disabled }: Readonly<{ form: Form; view: AdSettingsView; setRow: (i: number, patch: Partial<PlacementRow>) => void; rowErrors?: Record<number, string>; disabled: boolean }>) {
  const cell = `${inputCls} w-24 tabular-nums`;
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full min-w-[52rem] text-sm">
        <caption className="sr-only">Placement prices</caption>
        <thead>
          <tr className={tableHeadCls}>
            <th scope="col" className="px-5 py-2.5">Placement</th>
            <th scope="col" className="whitespace-nowrap px-3 py-2.5">On sale</th>
            <th scope="col" className="px-3 py-2.5">CPM (GH₵)</th>
            <th scope="col" className="px-3 py-2.5">Political CPM (GH₵)</th>
            <th scope="col" className="px-3 py-2.5">Fallback views/day</th>
            <th scope="col" className="px-5 py-2.5 text-right">Forecast now</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-sand">
          {form.placements.map((r, i) => {
            const meta = placementMeta(r.slug);
            const fc = view.forecast?.find((f) => f.slug === r.slug);
            const err = rowErrors?.[i];
            const appOff = r.slug === "app-card" && !form.appDeliveryEnabled;
            return (
              <tr key={r.slug} className="align-top">
                <td className="px-5 py-3">
                  <p className="font-semibold text-ink">{meta?.name}</p>
                  <p className="text-xs text-ink-faint">{meta?.sizes}</p>
                  {appOff && <p className="mt-1 text-xs text-clay-text">Not sold while app delivery is off.</p>}
                  {err && <p role="alert" className="mt-1 text-xs font-medium text-clay-text">{err}</p>}
                </td>
                <td className="px-3 py-3"><MiniSwitch checked={r.active} onChange={(v) => setRow(i, { active: v })} label={`${meta?.name} on sale`} disabled={disabled} /></td>
                <td className="px-3 py-3"><input aria-label={`${meta?.name} CPM in cedis`} value={r.cpm} onChange={(e) => setRow(i, { cpm: e.target.value })} inputMode="decimal" disabled={disabled} className={cell} /></td>
                <td className="px-3 py-3"><input aria-label={`${meta?.name} political CPM in cedis`} value={r.politicalCpm} onChange={(e) => setRow(i, { politicalCpm: e.target.value })} inputMode="decimal" disabled={disabled} className={cell} /></td>
                <td className="px-3 py-3"><input aria-label={`${meta?.name} fallback daily views`} value={r.fallback} onChange={(e) => setRow(i, { fallback: e.target.value })} inputMode="numeric" disabled={disabled} className={cell} /></td>
                <td className="px-5 py-3 text-right">
                  <p className="font-semibold tabular-nums text-ink">{fc ? count(fc.dailyOpportunities) : "—"}</p>
                  <p className="text-xs text-ink-faint">{fc?.source === "observed" ? "28-day average" : "Using fallback"}</p>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Component() {
  const loaded = useLoaderData() as AdSettingsView;
  const { member } = useAuth();
  const canEdit = isSteward(member?.role);
  const [base, setBase] = useState<AdSettingsView>(loaded);
  const [form, setForm] = useState<Form>(() => toForm(loaded));
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string; conflict?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [auditKey, setAuditKey] = useState(0);
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(base));

  const setNum = (k: NumKey | "taxLabel") => (v: string) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };
  const setBool = (k: "adsEnabled" | "politicalEnabled" | "appDeliveryEnabled" | "allowDistrictAssembly") => (v: boolean) => setForm((f) => ({ ...f, [k]: v }));
  const setRow = (i: number, patch: Partial<PlacementRow>) => {
    setForm((f) => ({ ...f, placements: f.placements.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
    setErrors((e) => (e.rows?.[i] ? { ...e, rows: { ...e.rows, [i]: "" } } : e));
  };
  const toggleBlocked = (slug: string, blocked: boolean) =>
    setForm((f) => ({ ...f, blocked: blocked ? [...new Set([...f.blocked, slug])] : f.blocked.filter((b) => b !== slug) }));

  async function reload() {
    setNotice(null);
    try {
      const fresh = await api.adSettings();
      setBase(fresh);
      setForm(toForm(fresh));
      setErrors({});
    } catch (e) {
      setNotice({ tone: "error", text: describeError(e, {}, "We couldn't reload the settings. Try again.") });
    }
  }

  function serverFieldError(field: string | undefined): Errors {
    if (!field) return {};
    const row = /^placements\[?\.?(\d+)/.exec(field);
    if (row) return { rows: { [Number(row[1])]: "The server rejected a value in this row." } };
    const spec = NUMBERS.find((s) => s.apiField === field);
    if (spec) return { [spec.key]: "The server rejected this value." };
    if (field === "taxLabel") return { taxLabel: "The server rejected this label." };
    return {};
  }

  async function save() {
    const v = validate(form);
    if (reason.trim().length < 5) v.reason = "Say why you're changing the rate card (at least 5 characters).";
    if (Object.keys(v).some((k) => k !== "rows") || v.rows) { setErrors(v); return; }
    setBusy(true);
    setNotice(null);
    try {
      const saved = await api.saveAdSettings(toSettings(form, base), reason.trim());
      const next = { ...base, ...saved };
      setBase(next);
      setForm(toForm(next));
      setReason("");
      setErrors({});
      setAuditKey((k) => k + 1);
      setNotice({ tone: "ok", text: "Rate card saved. New quotes use these prices now; existing quotes and campaigns keep theirs." });
    } catch (e) {
      setErrors(serverFieldError(errorField(e)));
      setNotice({ tone: "error", text: describeError(e, SETTINGS_ERRORS, "We couldn't save the ad settings. Try again."), conflict: errorCode(e) === "settings_conflict" });
    } finally {
      setBusy(false);
    }
  }

  const n = (k: NumKey) => NUMBERS.find((s) => s.key === k)!;

  return (
    <>
      <PageHeader tone="gold" kicker="Monetization" title="Ad pricing" lede="The published rate card and the switches for selling and serving ads. Prices are per 1,000 viewable impressions, before tax." />

      {!canEdit && <div className="mb-5"><ReadOnlyNotice>Only the steward can change prices and switches.</ReadOnlyNotice></div>}

      <p className="mb-6 flex items-start gap-3 rounded-xl border border-gold-border/40 bg-gold/[0.08] px-4 py-3 text-sm leading-relaxed text-ink">
        <svg viewBox="0 0 24 24" className="mt-0.5 size-4 shrink-0 text-gold-text" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" /></svg>
        Price changes apply to every advertiser and are public on the rate card.
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <Panel title="Switches">
            <div className="divide-y divide-sand">
              <Toggle label="Ads" checked={form.adsEnabled} onChange={setBool("adsEnabled")} disabled={!canEdit} description="Master switch for selling and serving. Off stops quotes and hides every slot; campaigns keep their status and undelivered views are refunded at the end." />
              <Toggle label="Political ads" checked={form.politicalEnabled} onChange={setBool("politicalEnabled")} disabled={!canEdit} description="Allows political submissions and serving. Blackouts on the election calendar pause political ads whatever this says." />
              <Toggle
                label="Deliver ads in the mobile app"
                checked={form.appDeliveryEnabled}
                onChange={setBool("appDeliveryEnabled")}
                disabled={!canEdit}
                description="Lets the app card placement be sold and shown."
                warning="Store risk: Apple may treat ads bought on the web and shown in the app as paid boosts under guideline 3.1.3(g). Keep this off until the owner has decided."
              />
              <Toggle
                label="District Assembly candidate ads"
                checked={form.allowDistrictAssembly}
                onChange={setBool("allowDistrictAssembly")}
                disabled={!canEdit}
                description="District Assembly and unit committee elections are non-partisan (Constitution, Art. 248)."
                warning="Legal risk: only allow these with legal advice. Sponsors must be the candidate, upload the EC authorisation, and use no party symbols."
              />
            </div>
          </Panel>
        </div>
        <aside className="space-y-5">
          <Panel title="Serving">
            <KeyIndicator label="Ad token secret" on={Boolean(base.tokenSecretConfigured)} detail="Signs every impression and click. Without it every slot stays empty." />
            <dl className="mt-3 space-y-2 border-t border-sand pt-3 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-ink-muted">Rate card version</dt><dd className="tabular-nums text-ink">{base.version}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-ink-muted">Effective from</dt><dd className="text-right tabular-nums text-ink">{base.effectiveFrom ? formatDateTime(base.effectiveFrom) : "Defaults"}</dd></div>
              {base.updatedByName && <div className="flex justify-between gap-3"><dt className="text-ink-muted">Last saved by</dt><dd className="text-right text-ink">{base.updatedByName}</dd></div>}
            </dl>
          </Panel>
          <section className="rounded-[var(--radius-card)] border border-sand bg-paper p-5 text-sm leading-relaxed text-ink-muted">
            <p className="font-semibold text-ink">Equal rates</p>
            <p className="mt-1 [text-wrap:pretty]">There are no per-advertiser prices, discounts or coupons. Quotes and campaigns already priced keep the price they were given.</p>
          </section>
        </aside>
      </div>

      <div className="mt-5 space-y-5">
          <Panel title="Placements" aside="Commercial and political CPMs, the forecast used before seven days of data, and what the forecast is right now.">
            <PlacementsTable form={form} view={base} setRow={setRow} rowErrors={errors.rows} disabled={!canEdit} />
          </Panel>

          <Panel title="Orders and tax">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {(["minOrder", "minImpressions", "impressionStep", "maxImpressionsPerOrder", "maxCampaignDays", "minLeadDays", "approvalValidHours", "sellThroughPercent", "taxPercent"] as NumKey[]).map((k) => (
                <NumField key={k} spec={n(k)} value={form[k]} onChange={setNum(k)} error={errors[k]} disabled={!canEdit} />
              ))}
              <div>
                <label htmlFor="ads-tax-label" className={labelCls}>Tax label</label>
                <input id="ads-tax-label" value={form.taxLabel} onChange={(e) => setNum("taxLabel")(e.target.value)} disabled={!canEdit} maxLength={60}
                  aria-invalid={Boolean(errors.taxLabel) || undefined} className={inputCls} />
                <p className="mt-1 text-xs text-ink-faint">Shown on quotes, e.g. VAT, NHIL and GETFund</p>
                <FieldError>{errors.taxLabel}</FieldError>
              </div>
            </div>
          </Panel>

          <Panel title="Blocked categories" aside="Ticked categories can't be bought. Tobacco, crypto and forex, adult, weapons, spiritual money, infant formula and male vitality are always blocked.">
            <ul className="space-y-1">
              {ADMIN_BLOCKABLE.map((c) => (
                <li key={c.slug}>
                  <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-paper">
                    <input type="checkbox" checked={form.blocked.includes(c.slug)} disabled={!canEdit} onChange={(e) => toggleBlocked(c.slug, e.target.checked)} className="mt-0.5 size-4 accent-green" />
                    <span className="text-sm text-ink"><span className="font-semibold">Block {c.label.toLowerCase()}</span><span className="block text-xs text-ink-faint">{c.rule} Blocked by default because readers may be under 18.</span></span>
                  </label>
                </li>
              ))}
            </ul>
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
                  <label htmlFor="ads-reason" className={labelCls}>Reason for the change (required)</label>
                  <input id="ads-reason" value={reason} onChange={(e) => { setReason(e.target.value); setErrors((er) => ({ ...er, reason: undefined })); }} maxLength={300}
                    placeholder="e.g. Owner confirmed launch prices (O10)" aria-invalid={Boolean(errors.reason) || undefined} className={inputCls} />
                  <FieldError>{errors.reason}</FieldError>
                </div>
                <div className="flex items-center gap-2 sm:pt-5">
                  <button type="button" onClick={() => { setForm(toForm(base)); setErrors({}); }} disabled={!dirty || busy} className={btnSecondary}>Discard</button>
                  <button type="button" onClick={save} disabled={!dirty || busy} className={btnPrimary}>{busy ? <BusyLabel label="Saving rate card" tone="dark" /> : "Save rate card"}</button>
                </div>
              </div>
            </section>
          )}
        </div>

      <div className="mt-6">
        <SettingsAuditHistory settingsKey="ads" refreshKey={auditKey} />
      </div>
    </>
  );
}
