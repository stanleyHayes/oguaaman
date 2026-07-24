import { useState } from "react";
import { Link, useLoaderData, useRevalidator } from "react-router-dom";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { mediaUrl } from "@/lib/media";
import { portalUrl } from "@/lib/portal";
import { BusyLabel } from "@/components/skeleton";
import type { Listing, Member } from "@/lib/types";
import { ArrowRight, Check, HeartHandshake, Info, Rocket } from "lucide-react";

interface Data {
  me: Member;
  campaigns: Listing[];
}

export async function loader(): Promise<Data> {
  const [me, campaigns] = await Promise.all([api.me(), api.myCampaigns().catch(() => [] as Listing[])]);
  return { me, campaigns };
}

const cedis = (pesewas: number) =>
  `GH₵ ${(pesewas / 100).toLocaleString("en-GH", { maximumFractionDigits: 2 })}`;

const STATUS_TONE: Record<string, string> = {
  approved: "bg-teal/[0.12] text-teal-text",
  pending: "bg-gold/[0.14] text-gold-text",
  rejected: "bg-maroon-900/[0.1] text-maroon-text",
  draft: "bg-sand text-ink-muted",
  unpublished: "bg-sand text-ink-muted",
};

const STEPS = ["Basics", "Story", "Goal", "Review"] as const;

interface Draft {
  title: string;
  category: string;
  coverImageUrl: string;
  description: string;
  goalCedis: string;
  deadline: string;
}

const EMPTY_DRAFT: Draft = { title: "", category: "", coverImageUrl: "", description: "", goalCedis: "", deadline: "" };

export function Component() {
  const { me, campaigns } = useLoaderData() as Data;
  const revalidator = useRevalidator();
  const creatorActive = Boolean(me.creatorSubscribedUntil && me.creatorSubscribedUntil > new Date().toISOString());

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof Draft, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  const goalPesewas = Math.round(Number.parseFloat(draft.goalCedis || "0") * 100);
  const stepValid = [
    draft.title.trim().length >= 2,
    draft.description.trim().length >= 20,
    goalPesewas >= 500,
    true,
  ][step];

  function startNew() {
    setDraft(EMPTY_DRAFT); setStep(0); setErr(null); setOpen(true);
  }

  async function submit() {
    setErr(null);
    setBusy(true);
    try {
      await api.createCampaign({
        title: draft.title.trim(),
        category: draft.category.trim() || undefined,
        coverImageUrl: draft.coverImageUrl.trim() || undefined,
        description: draft.description.trim(),
        goalPesewas,
        deadline: draft.deadline || undefined,
      });
      setOpen(false);
      revalidator.revalidate();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create the campaign.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.15em] text-clay-text">Fundraising</p>
          <h1 className="mt-1 text-2xl font-semibold text-ink sm:text-3xl">Your campaigns</h1>
          <p className="mt-1 text-sm text-ink-muted">Raise money for the causes and projects you care about.</p>
        </div>
        {creatorActive && (
          <button type="button" onClick={startNew} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-clay px-5 py-2.5 text-sm font-bold text-cream transition hover:opacity-90">
            <Rocket size={15} aria-hidden /> Start a campaign
          </button>
        )}
      </header>

      {!creatorActive && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold-border/40 bg-gold/[0.08] px-4 py-3.5 text-sm text-ink-muted">
          <span className="flex items-center gap-2"><Info size={16} className="text-gold-text" aria-hidden /> Fundraising campaigns need an active creator plan.</span>
          <Link to="/grow" className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-clay px-4 text-xs font-bold text-cream transition hover:opacity-90">Unlock on Grow <ArrowRight size={12} aria-hidden /></Link>
        </div>
      )}

      {!me.campaignerVetted && creatorActive && (
        <p className="mt-4 rounded-2xl border border-sand bg-cream px-4 py-3 text-xs text-ink-muted">
          Your first campaign is reviewed by our team before it goes live. After that, campaigns you start publish immediately.
        </p>
      )}

      {campaigns.length === 0 ? (
        <div className="mt-6 flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-sand bg-cream px-5 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-clay/[0.12] text-clay-text"><HeartHandshake size={22} aria-hidden /></span>
          <p className="mt-3 text-sm font-bold text-ink">No campaigns yet</p>
          <p className="mt-1 max-w-xs text-xs leading-5 text-ink-muted">{creatorActive ? "Start your first campaign to begin raising funds." : "Subscribe to a creator plan to start fundraising."}</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((c) => (
            <article key={c.id} className="flex flex-col overflow-hidden rounded-2xl border border-sand bg-cream">
              {c.coverImageUrl && <img src={mediaUrl(c.coverImageUrl)} alt="" className="aspect-[16/10] w-full object-cover" loading="lazy" />}
              <div className="flex flex-1 flex-col p-4">
                <span className={`w-fit rounded-full px-2.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider ${STATUS_TONE[c.status] ?? "bg-sand text-ink-muted"}`}>{c.status}</span>
                <h2 className="mt-2 text-base font-semibold text-ink">{c.title}</h2>
                <p className="mt-auto pt-3 text-sm text-ink-muted">
                  <strong className="text-ink">{cedis(c.details.raisedPesewas ?? 0)}</strong> raised
                  {c.details.goalPesewas ? ` of ${cedis(c.details.goalPesewas)}` : ""}
                </p>
                {c.status === "approved" && (
                  <a href={portalUrl(`/projects/${c.slug}`)} target="_blank" rel="noopener noreferrer" className="mt-2 text-xs font-bold text-clay-text hover:underline">View public page →</a>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Start a campaign">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[1.5rem] border border-sand bg-paper p-5 shadow-2xl sm:rounded-[1.5rem] sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-ink">Start a campaign</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-full border border-sand px-2.5 py-1 text-sm text-ink-muted hover:border-clay hover:text-clay-text">✕</button>
            </div>

            {/* Stepper */}
            <ol className="mt-4 flex items-center gap-2">
              {STEPS.map((label, i) => (
                <li key={label} className="flex flex-1 items-center gap-2">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${i < step ? "bg-teal text-white" : i === step ? "bg-clay text-cream" : "bg-sand text-ink-muted"}`}>
                    {i < step ? <Check size={13} strokeWidth={3} aria-hidden /> : i + 1}
                  </span>
                  <span className={`hidden text-xs font-semibold sm:block ${i === step ? "text-ink" : "text-ink-faint"}`}>{label}</span>
                  {i < STEPS.length - 1 && <span className="h-px flex-1 bg-sand" aria-hidden />}
                </li>
              ))}
            </ol>

            <div className="mt-5 space-y-3">
              {step === 0 && (
                <>
                  <Field label="Campaign title">
                    <input value={draft.title} onChange={(e) => set("title", e.target.value)} className={inputCls} placeholder="A recording studio for the youth choir" />
                  </Field>
                  <Field label="Category (optional)">
                    <input value={draft.category} onChange={(e) => set("category", e.target.value)} className={inputCls} placeholder="music · community · education…" />
                  </Field>
                  <Field label="Cover image URL (optional)">
                    <input value={draft.coverImageUrl} onChange={(e) => set("coverImageUrl", e.target.value)} className={inputCls} placeholder="https://…" />
                  </Field>
                </>
              )}
              {step === 1 && (
                <Field label="Tell the story">
                  <textarea value={draft.description} onChange={(e) => set("description", e.target.value)} rows={6} className={inputCls} placeholder="What are you raising money for, and what will it achieve? (at least 20 characters)" />
                </Field>
              )}
              {step === 2 && (
                <>
                  <Field label="Funding goal (GH₵)">
                    <input value={draft.goalCedis} onChange={(e) => set("goalCedis", e.target.value)} inputMode="decimal" className={inputCls} placeholder="5000" />
                  </Field>
                  <Field label="Deadline (optional)">
                    <input type="date" value={draft.deadline} onChange={(e) => set("deadline", e.target.value)} className={inputCls} />
                  </Field>
                </>
              )}
              {step === 3 && (
                <div className="rounded-2xl border border-sand bg-cream p-4 text-sm">
                  <Row label="Title" value={draft.title} />
                  {draft.category && <Row label="Category" value={draft.category} />}
                  <Row label="Goal" value={cedis(goalPesewas)} />
                  {draft.deadline && <Row label="Deadline" value={formatDate(draft.deadline)} />}
                  <p className="mt-3 border-t border-sand pt-3 text-xs leading-5 text-ink-muted">{draft.description}</p>
                  <p className="mt-3 text-xs text-ink-faint">{me.campaignerVetted ? "This will publish immediately." : "This first campaign will be reviewed before going live."}</p>
                </div>
              )}
            </div>

            {err && <p className="mt-3 rounded-xl border border-maroon-900/20 bg-maroon-900/[0.08] px-3 py-2 text-sm text-maroon-text" role="alert">{err}</p>}

            <div className="mt-5 flex items-center justify-between gap-3">
              <button type="button" onClick={() => (step === 0 ? setOpen(false) : setStep(step - 1))} className="min-h-11 rounded-full border border-sand px-4 text-sm font-semibold text-ink-muted hover:border-clay/40">
                {step === 0 ? "Cancel" : "Back"}
              </button>
              {step < STEPS.length - 1 ? (
                <button type="button" onClick={() => setStep(step + 1)} disabled={!stepValid} className="min-h-11 rounded-full bg-clay px-5 text-sm font-bold text-cream transition hover:opacity-90 disabled:opacity-50">Continue</button>
              ) : (
                <button type="button" onClick={submit} disabled={busy} aria-busy={busy || undefined} className="min-h-11 rounded-full bg-clay px-5 text-sm font-bold text-cream transition hover:opacity-90 disabled:opacity-60">
                  {busy ? <BusyLabel label="Creating campaign" width="w-24" /> : "Create campaign"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const inputCls = "w-full rounded-xl border border-sand bg-cream px-3.5 py-2.5 text-ink placeholder:text-ink-faint focus:border-clay focus:outline-none focus:ring-2 focus:ring-clay/15";

function Field({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-faint">{label}</span>
      {children}
    </label>
  );
}

function Row({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <p className="flex items-baseline justify-between gap-4 py-0.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{label}</span>
      <span className="font-semibold text-ink">{value}</span>
    </p>
  );
}
