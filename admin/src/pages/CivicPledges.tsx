import { useState } from "react";
import { useLoaderData, useRevalidator } from "react-router-dom";
import { api } from "@/lib/api";
import type { CivicBehaviour, CivicBehaviourInput, CivicBehaviourType, CivicRing } from "@/lib/types";
import { PageHeader, Card, Empty, Pill, Select } from "@/components/ui";
import { Stagger, StaggerItem } from "@/components/motion";
import { BusyLabel } from "@/components/skeleton";
import { useAuth } from "@/lib/auth";

export async function loader(): Promise<CivicBehaviour[]> {
  return api.civicBehaviours();
}

const inputCls = "w-full rounded-lg border border-sand bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-green-text focus:outline-none focus:ring-2 focus:ring-green/15";
const labelCls = "mb-1 block text-xs font-medium text-ink-muted";

// Concentric commitment rings, Self → Nation. Unlike town goals, a civic pledge
// is always scoped to a ring (no townwide "" option).
const RING_ORDER: CivicRing[] = ["self", "home", "school", "work", "town", "nation"];
const RING_LABEL: Record<CivicRing, string> = {
  self: "Self", home: "Home", school: "School", work: "Work", town: "Town", nation: "Nation",
};
const RING_BLURB: Record<CivicRing, string> = {
  self: "What each resident carries on their own.",
  home: "How we keep our households and neighbours.",
  school: "How pupils and teachers show up.",
  work: "How we conduct ourselves at work and in trade.",
  town: "How we treat Cape Coast's shared spaces.",
  nation: "How we stand as citizens of Ghana.",
};

const TYPE_META: Record<CivicBehaviourType, { label: string; badge: string }> = {
  do: { label: "Do", badge: "bg-green/[0.1] text-green-text" },
  stop: { label: "Stop", badge: "bg-clay/[0.12] text-clay-text" },
};

interface FormState {
  ring: CivicRing;
  type: CivicBehaviourType;
  title: string;
  description: string;
  why: string;
}
const EMPTY_FORM: FormState = { ring: "self", type: "do", title: "", description: "", why: "" };

function toForm(b: CivicBehaviour): FormState {
  return { ring: b.ring, type: b.type, title: b.title, description: b.description, why: b.why };
}
function toPayload(f: FormState): CivicBehaviourInput {
  return {
    ring: f.ring,
    type: f.type,
    title: f.title.trim(),
    description: f.description.trim(),
    why: f.why.trim(),
  };
}

// DOs before STOPs within a ring, then alphabetical for a stable order.
function sortBehaviours(list: CivicBehaviour[]): CivicBehaviour[] {
  return [...list].sort((a, b) => {
    if (a.type !== b.type) return a.type === "do" ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
}

export function Component() {
  const behaviours = useLoaderData() as CivicBehaviour[];
  const { revalidate } = useRevalidator();
  const { member } = useAuth();
  const role = member?.role;
  const canCurate = role === "curator" || role === "steward";

  const [editing, setEditing] = useState<CivicBehaviour | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const groups = RING_ORDER
    .map((ring) => ({ ring, items: sortBehaviours(behaviours.filter((b) => b.ring === ring)) }))
    .filter((group) => group.items.length > 0);

  const doCount = behaviours.filter((b) => b.type === "do").length;
  const stopCount = behaviours.filter((b) => b.type === "stop").length;

  function openNew() { setEditing("new"); setForm(EMPTY_FORM); setError(null); }
  function openEdit(b: CivicBehaviour) { setEditing(b); setForm(toForm(b)); setError(null); }

  async function save() {
    if (!form.title.trim() || !form.description.trim()) {
      setError("A ring, a Do/Stop, a title, and a description are all required.");
      return;
    }
    setBusy(true); setError(null);
    try {
      const payload = toPayload(form);
      if (editing === "new") await api.createCivicBehaviour(payload);
      else if (editing) await api.updateCivicBehaviour(editing.slug, payload);
      setEditing(null);
      revalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the pledge.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(b: CivicBehaviour) {
    if (!window.confirm(`Delete “${b.title}”? It leaves the public Better Cape Coast page and cannot be recovered.`)) return;
    setRowBusy(b.slug); setError(null);
    try {
      await api.deleteCivicBehaviour(b.slug);
      if (editing !== "new" && editing?.slug === b.slug) setEditing(null);
      revalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the pledge.");
    } finally {
      setRowBusy(null);
    }
  }

  return (
    <>
      <PageHeader kicker="Civic accountability · Building a Better Cape Coast" title="Civic pledges">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="green">{doCount} to do</Pill>
          <Pill tone="clay">{stopCount} to stop</Pill>
          {canCurate && (
            <button type="button" onClick={openNew} className="rounded-lg bg-green px-4 py-2 text-sm font-semibold text-on-green hover:bg-green-900">
              New pledge
            </button>
          )}
        </div>
      </PageHeader>

      <p className="mb-5 max-w-2xl text-sm text-ink-muted">
        The everyday behaviours residents pledge to on the public <b>Building a Better Cape Coast</b> page — each a
        thing to <b className="text-green-text">do</b> or to <b className="text-clay-text">stop</b>, scoped from
        the self outward to the nation. Curators author and edit these; residents make their pledges against them.
      </p>

      {canCurate && editing && (
        <Card className="mb-6 p-5">
          <h2 className="mb-4 text-base font-semibold text-ink">{editing === "new" ? "Add a civic pledge" : `Edit “${editing.title}”`}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className={labelCls}>Ring</span>
              <Select value={form.ring} onValueChange={(ring) => set("ring", ring as CivicRing)} className="w-full">
                {RING_ORDER.map((r) => <option key={r} value={r}>{RING_LABEL[r]}</option>)}
              </Select></label>

            <div className="block">
              <span className={labelCls}>Kind</span>
              <div className="inline-flex w-full rounded-lg border border-sand bg-paper p-1">
                {(["do", "stop"] as CivicBehaviourType[]).map((t) => {
                  const active = form.type === t;
                  const activeCls = t === "do" ? "bg-green text-on-green" : "bg-clay text-white";
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => set("type", t)}
                      aria-pressed={active}
                      className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${active ? activeCls : "text-ink-muted hover:bg-cream"}`}
                    >
                      {t === "do" ? "Do this" : "Stop this"}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="block sm:col-span-2"><span className={labelCls}>Title</span>
              <input value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={160} className={inputCls} placeholder="Keep your frontage clean" /></label>

            <label className="block sm:col-span-2"><span className={labelCls}>Description</span>
              <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} className={inputCls} placeholder="What the behaviour looks like in practice…" /></label>

            <label className="block sm:col-span-2"><span className={labelCls}>Why (the reason it matters)</span>
              <input value={form.why} onChange={(e) => set("why", e.target.value)} className={inputCls} placeholder="A clean frontage keeps gutters flowing and drives off disease." /></label>
          </div>
          {editing !== "new" && (
            <p className="mt-3 text-xs text-ink-faint">The web address (<code className="rounded bg-paper px-1 py-0.5">{editing.slug}</code>) is fixed — residents' pledges are keyed to it — so it stays the same when you save.</p>
          )}
          {error && <p className="mt-3 text-sm text-clay-text">{error}</p>}
          <div className="mt-4 flex gap-3">
            <button type="button" onClick={save} disabled={busy} className="rounded-lg bg-green px-4 py-2 text-sm font-semibold text-on-green hover:bg-green-900 disabled:opacity-50">
              {busy ? <BusyLabel label="Saving pledge" className="justify-center" /> : editing === "new" ? "Add pledge" : "Save changes"}
            </button>
            <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-sand px-4 py-2 text-sm text-ink-muted hover:bg-paper">Cancel</button>
          </div>
        </Card>
      )}

      {error && !editing && <p className="mb-4 text-sm text-clay-text">{error}</p>}

      {behaviours.length === 0 ? (
        <Empty icon="heart" title="No civic pledges yet">
          {canCurate ? "Add the first behaviour above — start with something close to home, in the Self ring." : "Nothing has been published yet — a curator will set the town's pledges."}
        </Empty>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.ring}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-bold uppercase tracking-wide text-ink-muted">{RING_LABEL[group.ring]}</h2>
                <Pill tone="neutral">{group.items.length}</Pill>
                <span className="text-xs text-ink-faint">{RING_BLURB[group.ring]}</span>
              </div>
              <Stagger className="space-y-3">
                {group.items.map((b, idx) => (
                  <StaggerItem key={b.slug} index={idx}>
                    <PledgeCard behaviour={b} canCurate={canCurate} onEdit={openEdit} onDelete={remove} deleting={rowBusy === b.slug} />
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

interface PledgeCardProps {
  behaviour: CivicBehaviour;
  canCurate: boolean;
  onEdit: (b: CivicBehaviour) => void;
  onDelete: (b: CivicBehaviour) => void;
  deleting: boolean;
}

function PledgeCard({ behaviour, canCurate, onEdit, onDelete, deleting }: Readonly<PledgeCardProps>) {
  const meta = TYPE_META[behaviour.type];
  return (
    <Card className={`p-5 ${behaviour.type === "stop" ? "border-clay/25" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${meta.badge}`}>{meta.label}</span>
        <Pill tone="neutral">Ring · {RING_LABEL[behaviour.ring]}</Pill>
      </div>

      <h3 className="mt-2 text-lg font-semibold text-ink">{behaviour.title}</h3>
      <p className="mt-1 max-w-2xl text-sm text-ink-muted">{behaviour.description}</p>
      {behaviour.why && <p className="mt-2 max-w-2xl text-sm text-green-text"><span className="font-semibold">Why · </span>{behaviour.why}</p>}

      {canCurate && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-sand pt-4">
          <button type="button" onClick={() => onEdit(behaviour)} className="rounded-full border border-sand px-4 py-1.5 text-xs font-semibold text-ink-muted hover:bg-paper">Edit</button>
          <button type="button" disabled={deleting} onClick={() => onDelete(behaviour)} className="rounded-full border border-maroon-text/40 px-4 py-1.5 text-xs font-semibold text-maroon-text hover:bg-maroon-900/[0.05] disabled:opacity-50">
            {deleting ? <BusyLabel label="Deleting pledge" className="justify-center" /> : "Delete"}
          </button>
        </div>
      )}
    </Card>
  );
}
