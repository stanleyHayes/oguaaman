import { useState } from "react";
import { Link, useLoaderData, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import type { Organization } from "@/lib/types";
import { PageHeader, Card } from "@/components/ui";
import { InstitutionLogo } from "@/components/crest";

// The heritage/visitor places shown on the marketing Visit page. A shortcut to
// find and configure them (the editor lives on the detail page) — and to add new
// ones, which then appear on the public Visit grid automatically.
export async function loader() {
  return api.institutions("heritage");
}

function count(n: number | undefined, one: string, many: string): string {
  const c = n ?? 0;
  return `${c} ${c === 1 ? one : many}`;
}

const field = "w-full rounded-md border border-sand bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-gold-brand focus:outline-none";
const labelCls = "block text-xs font-semibold uppercase tracking-wide text-ink-faint";

function NewPlaceForm({ onClose }: Readonly<{ onClose: () => void }>) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [classification, setClassification] = useState("");
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const org = await api.createInstitution({ name: name.trim(), kind: "heritage", classification: classification.trim(), summary: summary.trim() });
      // Jump straight to its configure editor (history, sections, photos).
      navigate(`/institutions/${org.slug}`);
    } catch (e) {
      setError((e as Error).message || "Couldn't create the place.");
      setBusy(false);
    }
  }

  return (
    <Card className="mb-6 p-5">
      <h2 className="font-display text-lg font-semibold text-ink">New place</h2>
      <p className="mt-1 text-sm text-ink-muted">Create a heritage / visitor place. You'll configure its history, sections and photos next; it appears on the public Visit grid once saved.</p>
      <div className="mt-4 space-y-3">
        <div>
          <label htmlFor="place-name" className={labelCls}>Name</label>
          <input id="place-name" className={`mt-1.5 ${field}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Brenu Beach" autoFocus />
        </div>
        <div>
          <label htmlFor="place-classification" className={labelCls}>Classification</label>
          <input id="place-classification" className={`mt-1.5 ${field}`} value={classification} onChange={(e) => setClassification(e.target.value)} placeholder="e.g. Beach · museum · waterfall · fort" />
        </div>
        <div>
          <label htmlFor="place-summary" className={labelCls}>Summary</label>
          <textarea id="place-summary" rows={2} className={`mt-1.5 resize-none ${field}`} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="One or two sentences shown on the card and the page hero." />
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={create} disabled={busy || !name.trim()} className="rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-cream hover:bg-green-900 disabled:opacity-60">
            {busy ? "Creating…" : "Create & configure →"}
          </button>
          <button type="button" onClick={onClose} className="text-sm font-medium text-ink-muted hover:text-ink">Cancel</button>
          {error && <span className="text-sm text-clay-text">{error}</span>}
        </div>
      </div>
    </Card>
  );
}

export function Component() {
  const places = useLoaderData() as Organization[];
  const [adding, setAdding] = useState(false);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader kicker="Visit · marketing site" title="Heritage & visitor places" />
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="shrink-0 rounded-full bg-green px-4 py-2 text-sm font-semibold text-cream hover:bg-green-900">
            + New place
          </button>
        )}
      </div>
      <p className="mb-5 max-w-2xl text-sm text-ink-muted">
        The castles, parks, market and shore shown on the public Visit page. Open one to configure its
        summary, history, sections and photos — each renders live at <span className="font-mono text-xs text-ink-muted">/visit/&lt;slug&gt;</span>.
      </p>

      {adding && <NewPlaceForm onClose={() => setAdding(false)} />}

      {places.length === 0 ? (
        <Card className="p-8 text-center text-sm text-ink-muted">No places yet — add the first with “New place”.</Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {places.map((p) => (
            <Link key={p.id} to={`/institutions/${p.slug}`} className="group block">
              <Card className="flex h-full flex-col p-5 transition-shadow hover:shadow-[var(--shadow-lift)]">
                <div className="flex items-start gap-3">
                  <InstitutionLogo org={p} size={44} />
                  <div className="min-w-0">
                    <h3 className="font-display text-lg font-semibold text-ink">{p.name}</h3>
                    {p.classification && <p className="text-xs text-ink-faint">{p.classification}</p>}
                  </div>
                </div>
                {p.summary && <p className="mt-3 line-clamp-3 text-sm text-ink-muted">{p.summary}</p>}
                <div className="mt-4 flex items-center justify-between border-t border-sand pt-3 text-xs text-ink-faint">
                  <span>{count(p.sections?.length, "section", "sections")} · {count(p.gallery?.length, "photo", "photos")}</span>
                  <span className="font-semibold text-green opacity-0 transition-opacity group-hover:opacity-100">Configure →</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
