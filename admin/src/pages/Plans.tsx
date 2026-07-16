import { useState } from "react";
import { useLoaderData, useRevalidator } from "react-router-dom";
import { api, type PlanPayload } from "@/lib/api";
import type { Plan } from "@/lib/types";
import { PageHeader, Card, Empty, Pill } from "@/components/ui";
import { formatDate } from "@/lib/format";

export async function loader() {
  return api.plans();
}

const cedis = (pesewas?: number) =>
  `GH₵ ${((pesewas ?? 0) / 100).toLocaleString("en-GH", { maximumFractionDigits: 2 })}`;

const inputCls = "w-full rounded-lg border border-sand bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-green-text focus:outline-none focus:ring-2 focus:ring-green/15";
const labelCls = "mb-1 block text-xs font-medium text-ink-muted";

interface FormState {
  name: string; slug: string; audience: "any" | "business" | "creator";
  interval: "free" | "month"; defaultPrice: string; businessPrice: string; creatorPrice: string;
  perks: string; maxListings: string; includedPromoDays: string; goldBadge: boolean;
  active: boolean; sortOrder: string;
}

const EMPTY_FORM: FormState = {
  name: "", slug: "", audience: "business", interval: "month",
  defaultPrice: "", businessPrice: "", creatorPrice: "", perks: "",
  maxListings: "", includedPromoDays: "", goldBadge: false, active: true, sortOrder: "10",
};

function toForm(p: Plan): FormState {
  return {
    name: p.name, slug: p.slug, audience: p.audience, interval: p.interval,
    defaultPrice: String((p.prices.default ?? 0) / 100),
    businessPrice: p.prices.business != null ? String(p.prices.business / 100) : "",
    creatorPrice: p.prices.creator != null ? String(p.prices.creator / 100) : "",
    perks: (p.perks ?? []).join("\n"),
    maxListings: p.maxListings ? String(p.maxListings) : "",
    includedPromoDays: p.includedPromoDays ? String(p.includedPromoDays) : "",
    goldBadge: !!p.goldBadge, active: p.active, sortOrder: String(p.sortOrder),
  };
}

function toPayload(f: FormState): PlanPayload {
  const prices: Record<string, number> = { default: Math.round(Number.parseFloat(f.defaultPrice || "0") * 100) };
  if (f.businessPrice.trim()) prices.business = Math.round(Number.parseFloat(f.businessPrice) * 100);
  if (f.creatorPrice.trim()) prices.creator = Math.round(Number.parseFloat(f.creatorPrice) * 100);
  return {
    name: f.name.trim(), slug: f.slug.trim() || undefined, audience: f.audience, interval: f.interval,
    prices, perks: f.perks.split("\n").map((s) => s.trim()).filter(Boolean),
    maxListings: f.maxListings.trim() ? Number.parseInt(f.maxListings, 10) : 0,
    includedPromoDays: f.includedPromoDays.trim() ? Number.parseInt(f.includedPromoDays, 10) : 0,
    goldBadge: f.goldBadge, active: f.active,
    sortOrder: Number.parseInt(f.sortOrder || "10", 10) || 10,
  };
}

export function Component() {
  const plans = useLoaderData() as Plan[];
  const { revalidate } = useRevalidator();
  const [editing, setEditing] = useState<Plan | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  function openNew() { setEditing("new"); setForm(EMPTY_FORM); setError(null); }
  function openEdit(p: Plan) { setEditing(p); setForm(toForm(p)); setError(null); }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (editing === "new") await api.planCreate(toPayload(form));
      else if (editing) await api.planUpdate(editing.id, toPayload(form));
      setEditing(null);
      revalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the plan.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(p: Plan) {
    if (!window.confirm(`Delete the ${p.name} plan? Existing subscriptions keep their recorded plan and amount.`)) return;
    setBusy(true);
    try {
      await api.planDelete(p.id);
      revalidate();
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(p: Plan) {
    await api.planUpdate(p.id, { ...toPayload(toForm(p)), active: !p.active });
    revalidate();
  }

  return (
    <>
      <PageHeader kicker="Monetization" title="Plans">
        <button type="button" onClick={openNew} className="rounded-lg bg-green px-4 py-2 text-sm font-semibold text-on-green hover:bg-green-900">
          New plan
        </button>
      </PageHeader>

      {editing && (
        <Card className="mb-6 p-5">
          <h2 className="mb-4 text-base font-semibold text-ink">{editing === "new" ? "New plan" : `Edit ${editing.name}`}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block"><span className={labelCls}>Name</span>
              <input value={form.name} onChange={(e) => set("name", e.target.value)} className={inputCls} placeholder="Supporter" /></label>
            <label className="block"><span className={labelCls}>Slug (optional — derived from the name)</span>
              <input value={form.slug} onChange={(e) => set("slug", e.target.value)} className={inputCls} placeholder="supporter" /></label>
            <label className="block"><span className={labelCls}>Audience</span>
              <select value={form.audience} onChange={(e) => set("audience", e.target.value as FormState["audience"])} className={inputCls}>
                <option value="any">Anyone</option><option value="business">Businesses</option><option value="creator">Artists / organisers</option>
              </select></label>
            <label className="block"><span className={labelCls}>Billing</span>
              <select value={form.interval} onChange={(e) => set("interval", e.target.value as FormState["interval"])} className={inputCls}>
                <option value="month">Monthly</option><option value="free">Free</option>
              </select></label>
            <label className="block"><span className={labelCls}>Default price (GH₵/mo)</span>
              <input value={form.defaultPrice} onChange={(e) => set("defaultPrice", e.target.value)} inputMode="decimal" className={inputCls} placeholder="30" /></label>
            <label className="block"><span className={labelCls}>Business price (GH₵/mo, optional)</span>
              <input value={form.businessPrice} onChange={(e) => set("businessPrice", e.target.value)} inputMode="decimal" className={inputCls} placeholder="50" /></label>
            <label className="block"><span className={labelCls}>Creator price (GH₵/mo, optional)</span>
              <input value={form.creatorPrice} onChange={(e) => set("creatorPrice", e.target.value)} inputMode="decimal" className={inputCls} placeholder="30" /></label>
            <label className="block"><span className={labelCls}>Max live listings</span>
              <input value={form.maxListings} onChange={(e) => set("maxListings", e.target.value)} inputMode="numeric" className={inputCls} placeholder="3" /></label>
            <label className="block"><span className={labelCls}>Included promotion days / month</span>
              <input value={form.includedPromoDays} onChange={(e) => set("includedPromoDays", e.target.value)} inputMode="numeric" className={inputCls} placeholder="0" /></label>
            <label className="block"><span className={labelCls}>Sort order</span>
              <input value={form.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} inputMode="numeric" className={inputCls} placeholder="10" /></label>
            <label className="block sm:col-span-2 lg:col-span-3"><span className={labelCls}>Perks (one per line)</span>
              <textarea value={form.perks} onChange={(e) => set("perks", e.target.value)} rows={3} className={inputCls} placeholder={"Gold ★ badge\nPriority sorting in the directory"} /></label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={form.goldBadge} onChange={(e) => set("goldBadge", e.target.checked)} className="accent-green" /> Gold ★ badge</label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} className="accent-green" /> On sale (visible publicly)</label>
          </div>
          {error && <p className="mt-3 text-sm text-clay-text">{error}</p>}
          <div className="mt-4 flex gap-3">
            <button type="button" onClick={save} disabled={busy} className="rounded-lg bg-green px-4 py-2 text-sm font-semibold text-on-green hover:bg-green-900 disabled:opacity-50">
              {busy ? "Saving…" : "Save plan"}
            </button>
            <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-sand px-4 py-2 text-sm text-ink-muted hover:bg-paper">Cancel</button>
          </div>
        </Card>
      )}

      {plans.length === 0 ? (
        <Empty icon="money" title="No plans yet">Seed data loads Starter, Supporter and Featured — or create one above.</Empty>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="border-b border-sand text-left text-[0.65rem] font-bold uppercase tracking-wider text-ink-faint">
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Audience</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Perks</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id} className="border-b border-sand/60 last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-ink">{p.name}{p.goldBadge ? " ★" : ""}</p>
                    <p className="text-xs text-ink-faint">{p.slug} · order {p.sortOrder}</p>
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{p.audience === "any" ? "Anyone" : p.audience === "business" ? "Businesses" : "Artists / organisers"}</td>
                  <td className="px-4 py-3">
                    <p className="text-ink">{p.interval === "free" ? "Free" : `${cedis(p.prices.default)}/mo`}</p>
                    {p.prices.business != null && <p className="text-xs text-ink-faint">business {cedis(p.prices.business)}/mo</p>}
                    {p.prices.creator != null && <p className="text-xs text-ink-faint">creator {cedis(p.prices.creator)}/mo</p>}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-muted">
                    {(p.perks ?? []).slice(0, 2).join(" · ")}{(p.perks ?? []).length > 2 ? ` +${(p.perks ?? []).length - 2}` : ""}
                    {(p.includedPromoDays ?? 0) > 0 && <span className="block text-gold-text">+{p.includedPromoDays} promo days/mo</span>}
                  </td>
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => toggleActive(p)}>
                      <Pill tone={p.active ? "green" : "neutral"}>{p.active ? "On sale" : "Hidden"}</Pill>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-faint">{formatDate(p.updatedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => openEdit(p)} className="mr-3 text-sm font-medium text-green-text hover:underline">Edit</button>
                    <button type="button" onClick={() => remove(p)} disabled={busy} className="text-sm font-medium text-clay-text hover:underline disabled:opacity-50">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
