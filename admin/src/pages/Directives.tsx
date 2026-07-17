import { useEffect, useMemo, useState } from "react";
import { useLoaderData, useRevalidator } from "react-router-dom";
import { api, type DirectivePayload } from "@/lib/api";
import type { Directive, DirectiveKind, DirectiveSeverity, Organization } from "@/lib/types";
import { PageHeader, Card, Empty, Pill } from "@/components/ui";
import { Stagger, StaggerItem } from "@/components/motion";
import { formatDate } from "@/lib/format";

interface LoaderData { directives: Directive[]; orgs: Organization[] }

export async function loader(): Promise<LoaderData> {
  // adminDirectives is curator+steward; the admin institution directory is
  // steward-only, so fall back to the public (verified) list for curators.
  const [directives, orgs] = await Promise.all([
    api.adminDirectives(),
    api.institutions().catch(() => api.publicInstitutions().catch(() => [] as Organization[])),
  ]);
  return { directives, orgs };
}

// Authority institution kinds — the orgs that may issue directives (steward may
// pick any org, but these are surfaced first). Mirrors domain.IsAuthorityKind.
const AUTHORITY_KINDS = ["emergency-service", "security-service", "health-service", "local-government"];
const KIND_LABEL: Record<string, string> = {
  "emergency-service": "Emergency service", "security-service": "Security service",
  "health-service": "Health service", "local-government": "Local government",
  school: "School", "traditional-authority": "Traditional authority", association: "Association",
  faith: "Faith body", civic: "Civic body", business: "Business", asafo: "Asafo company",
};

// Mirrors the incident SEVERITY_CLASS — palette tokens carry their own dark
// overrides, so white/green-900 foregrounds stay legible in both themes.
const SEVERITY_CLASS: Record<string, string> = {
  critical: "bg-maroon-900 text-white",
  high: "bg-clay text-white",
  medium: "bg-gold-brand text-green-900",
  low: "bg-teal text-white",
};

const SEVERITIES: { value: DirectiveSeverity; label: string }[] = [
  { value: "low", label: "Low" }, { value: "medium", label: "Medium" },
  { value: "high", label: "High" }, { value: "critical", label: "Critical" },
];
const KINDS: { value: DirectiveKind; label: string }[] = [
  { value: "advisory", label: "Advisory" }, { value: "directive", label: "Directive" },
  { value: "emergency", label: "Emergency" },
];

const inputCls = "w-full rounded-lg border border-sand bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-green-text focus:outline-none focus:ring-2 focus:ring-green/15";
const labelCls = "mb-1 block text-xs font-medium text-ink-muted";

interface FormState {
  title: string; body: string; severity: DirectiveSeverity; kind: DirectiveKind;
  issuedByOrgId: string; action: string; area: string; effectiveFrom: string; effectiveUntil: string;
}
const EMPTY_FORM: FormState = {
  title: "", body: "", severity: "medium", kind: "advisory",
  issuedByOrgId: "", action: "", area: "", effectiveFrom: "", effectiveUntil: "",
};

/** A datetime-local value ("2026-07-16T06:00") → RFC3339, or undefined when blank. */
function toISO(local: string): string | undefined {
  if (!local.trim()) return undefined;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function dateTime(iso?: string): string {
  if (!iso) return "—";
  const t = iso.includes("T") ? ` · ${iso.slice(11, 16)} GMT` : "";
  return `${formatDate(iso)}${t}`;
}

function relTime(ms: number): string {
  const abs = Math.abs(ms);
  const mins = Math.floor(abs / 60000);
  if (mins < 1) return "under a minute";
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs} hr`;
  return `${Math.floor(hrs / 24)} days`;
}

type WindowTone = "green" | "gold" | "neutral" | "clay";
function windowLabel(d: Directive, now: number): { text: string; tone: WindowTone } {
  if (d.status === "cancelled") return { text: "Cancelled", tone: "clay" };
  if (d.status === "expired") return { text: `Expired ${formatDate(d.effectiveUntil ?? d.effectiveFrom)}`, tone: "neutral" };
  const from = Date.parse(d.effectiveFrom);
  if (!Number.isNaN(from) && now < from) return { text: `Starts in ${relTime(from - now)}`, tone: "gold" };
  const until = d.effectiveUntil ? Date.parse(d.effectiveUntil) : null;
  if (until != null && !Number.isNaN(until)) {
    if (now > until) return { text: "Ending", tone: "gold" };
    return { text: `Ends in ${relTime(until - now)}`, tone: "green" };
  }
  return { text: "In effect · open-ended", tone: "green" };
}

export function Component() {
  const { directives, orgs } = useLoaderData() as LoaderData;
  const { revalidate } = useRevalidator();

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const authorities = useMemo(
    () => orgs.filter((o) => AUTHORITY_KINDS.includes(o.kind)).sort((a, b) => a.name.localeCompare(b.name)),
    [orgs],
  );
  const others = useMemo(
    () => orgs.filter((o) => !AUTHORITY_KINDS.includes(o.kind)).sort((a, b) => a.name.localeCompare(b.name)),
    [orgs],
  );

  const [form, setForm] = useState<FormState>(() => {
    const firstAuth = orgs.find((o) => AUTHORITY_KINDS.includes(o.kind));
    return { ...EMPTY_FORM, issuedByOrgId: (firstAuth ?? orgs[0])?.id ?? "" };
  });
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const broadcasts = form.severity === "high" || form.severity === "critical";
  const activeCount = directives.filter((d) => d.status === "active").length;

  async function submit() {
    if (!form.title.trim() || !form.body.trim() || !form.issuedByOrgId) {
      setError("Title, body and an issuing authority are all required.");
      return;
    }
    setBusy(true); setError(null); setMsg(null);
    const willBroadcast = broadcasts;
    try {
      const payload: DirectivePayload = {
        title: form.title.trim(),
        body: form.body.trim(),
        severity: form.severity,
        kind: form.kind,
        action: form.action.trim() || undefined,
        area: form.area.trim() || undefined,
        effectiveFrom: toISO(form.effectiveFrom),
        effectiveUntil: toISO(form.effectiveUntil),
        issuedByOrgId: form.issuedByOrgId,
      };
      const created = await api.createDirective(payload);
      setForm((f) => ({ ...EMPTY_FORM, issuedByOrgId: f.issuedByOrgId }));
      setMsg(`“${created.title}” issued from ${created.issuedByName}.${willBroadcast ? " Every member was notified." : ""}`);
      revalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not issue the directive.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel(d: Directive) {
    if (!window.confirm(`Cancel “${d.title}”? It stops showing on the public alerts feed.`)) return;
    setRowBusy(d.id);
    try {
      await api.cancelDirective(d.id);
      revalidate();
    } finally {
      setRowBusy(null);
    }
  }

  return (
    <>
      <PageHeader kicker="Alerts · authority directives" title="Directives">
        <Pill tone={activeCount > 0 ? "green" : "neutral"}>{activeCount} active</Pill>
      </PageHeader>
      <p className="mb-5 max-w-2xl text-sm text-ink-muted">
        Official notices from recognised authorities — advisories, directives, and emergencies. They
        surface on the public alerts feed while in effect. High and critical notices broadcast an in-app
        alert to every member the moment they are issued.
      </p>

      {/* Composer */}
      <Card className="mb-6 p-5">
        <h2 className="mb-4 text-base font-semibold text-ink">Issue a directive</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block sm:col-span-2 lg:col-span-3"><span className={labelCls}>Title</span>
            <input value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={160} className={inputCls} placeholder="Monthly national clean-up exercise" /></label>

          <label className="block sm:col-span-2 lg:col-span-3"><span className={labelCls}>Body</span>
            <textarea value={form.body} onChange={(e) => set("body", e.target.value)} rows={3} className={inputCls} placeholder="What residents need to know…" /></label>

          <label className="block"><span className={labelCls}>Issuing authority</span>
            <select value={form.issuedByOrgId} onChange={(e) => set("issuedByOrgId", e.target.value)} className={inputCls}>
              {orgs.length === 0 && <option value="">No institutions available</option>}
              {authorities.length > 0 && (
                <optgroup label="Authorities">
                  {authorities.map((o) => <option key={o.id} value={o.id}>{o.name} · {KIND_LABEL[o.kind] ?? o.kind}</option>)}
                </optgroup>
              )}
              {others.length > 0 && (
                <optgroup label="Other institutions">
                  {others.map((o) => <option key={o.id} value={o.id}>{o.name} · {KIND_LABEL[o.kind] ?? o.kind}</option>)}
                </optgroup>
              )}
            </select></label>

          <label className="block"><span className={labelCls}>Kind</span>
            <select value={form.kind} onChange={(e) => set("kind", e.target.value as DirectiveKind)} className={inputCls}>
              {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select></label>

          <label className="block"><span className={labelCls}>Severity</span>
            <select value={form.severity} onChange={(e) => set("severity", e.target.value as DirectiveSeverity)} className={inputCls}>
              {SEVERITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <span className={`mt-1 block text-[11px] ${broadcasts ? "text-clay-text" : "text-ink-faint"}`}>
              {broadcasts ? "Broadcasts an in-app alert to every member." : "No broadcast — appears on the alerts feed only."}
            </span></label>

          <label className="block"><span className={labelCls}>Area (optional)</span>
            <input value={form.area} onChange={(e) => set("area", e.target.value)} className={inputCls} placeholder="Cape Coast" /></label>

          <label className="block sm:col-span-2"><span className={labelCls}>Action (optional)</span>
            <input value={form.action} onChange={(e) => set("action", e.target.value)} className={inputCls} placeholder="Keep shops closed until 10:00" /></label>

          <label className="block"><span className={labelCls}>Effective from (optional — defaults to now)</span>
            <input type="datetime-local" value={form.effectiveFrom} onChange={(e) => set("effectiveFrom", e.target.value)} className={inputCls} /></label>

          <label className="block"><span className={labelCls}>Effective until (optional — open-ended)</span>
            <input type="datetime-local" value={form.effectiveUntil} onChange={(e) => set("effectiveUntil", e.target.value)} className={inputCls} /></label>
        </div>

        {error && <p className="mt-3 text-sm text-clay-text">{error}</p>}
        {msg && <p className="mt-3 text-sm text-green-text">{msg}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={submit} disabled={busy} className="rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-on-green hover:bg-green-900 disabled:opacity-50">
            {busy ? "Issuing…" : "Issue directive"}
          </button>
          <span className="text-xs text-ink-faint">The issuing authority is stamped on the notice; townId is inherited from your account.</span>
        </div>
      </Card>

      {/* Existing directives */}
      {directives.length === 0 ? (
        <Empty icon="megaphone" title="No directives yet">Nothing has been issued — the town is quiet.</Empty>
      ) : (
        <Stagger className="space-y-3">
          {directives.map((d, idx) => {
            const win = windowLabel(d, now);
            const dim = d.status === "cancelled" || d.status === "expired";
            return (
              <StaggerItem key={d.id} index={idx}>
                <Card className={`p-5 ${dim ? "opacity-70" : ""}`}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${SEVERITY_CLASS[d.severity] ?? "bg-sand text-ink-muted"}`}>
                          {d.severity}
                        </span>
                        <Pill tone="neutral">{d.kind}</Pill>
                        <Pill tone={win.tone}>{win.text}</Pill>
                        {d.area && <Pill tone="gold">{d.area}</Pill>}
                      </div>
                      <h3 className="mt-2 text-lg font-semibold text-ink">{d.title}</h3>
                      <p className="mt-1 max-w-2xl text-sm text-ink-muted">{d.body}</p>
                      {d.action && (
                        <p className="mt-2 text-sm font-medium text-clay-text">→ {d.action}</p>
                      )}
                      <p className="mt-2 text-xs text-ink-faint">
                        {d.issuedByName} · in effect {dateTime(d.effectiveFrom)}
                        {d.effectiveUntil ? <> → {dateTime(d.effectiveUntil)}</> : <> · open-ended</>}
                      </p>
                    </div>
                    {d.status === "active" && (
                      <button type="button"
                        disabled={rowBusy === d.id}
                        onClick={() => cancel(d)}
                        className="shrink-0 rounded-full border border-maroon-text/40 px-4 py-2 text-xs font-semibold text-maroon-text hover:bg-maroon-900/[0.05] disabled:opacity-50"
                      >
                        {rowBusy === d.id ? "Cancelling…" : "Cancel"}
                      </button>
                    )}
                  </div>
                </Card>
              </StaggerItem>
            );
          })}
        </Stagger>
      )}
    </>
  );
}
