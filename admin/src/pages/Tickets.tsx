import { useEffect, useMemo, useState } from "react";
import { useLoaderData } from "react-router-dom";
import { api } from "@/lib/api";
import type { Listing, Ticket, TicketTier } from "@/lib/types";
import { PageHeader, Card, Empty } from "@/components/ui";
import { MetricCard } from "@/components/metric-card";
import { Stagger, StaggerItem } from "@/components/motion";
import { Banknote, Ticket as TicketIcon, DoorOpen } from "lucide-react";
import { formatDate } from "@/lib/format";

export async function loader() {
  const listings = await api.listings();
  // Events that sell tickets (approved, with at least one tier).
  const events = listings.filter(
    (l) => l.type === "event" && l.status === "approved" && Array.isArray(l.details.tiers) && (l.details.tiers as TicketTier[]).length > 0,
  );
  return { events };
}

const cedis = (pesewas?: number) =>
  `GH₵ ${((pesewas ?? 0) / 100).toLocaleString("en-GH", { maximumFractionDigits: 2 })}`;

const STATUS_TONE: Record<Ticket["status"], string> = {
  success: "bg-green/[0.1] text-green",
  pending: "bg-gold/[0.16] text-gold-text",
  failed: "bg-maroon-900/[0.1] text-maroon-900",
};

export function Component() {
  const { events } = useLoaderData() as { events: Listing[] };
  const [slug, setSlug] = useState(events[0]?.slug ?? "");
  // The ledger is keyed by the slug it was fetched for; a mismatch means a
  // fetch for the newly-selected event is in flight (avoids a loading flag
  // set synchronously inside the effect).
  const [ledger, setLedger] = useState<{ slug: string; tickets: Ticket[] } | null>(null);
  const tickets = useMemo(() => (ledger?.slug === slug ? ledger.tickets : []), [ledger, slug]);
  const loading = !!slug && ledger?.slug !== slug;

  // Check-in box.
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (!slug) return; // no ticketed events — the empty state renders instead
    let alive = true;
    api.eventTickets(slug)
      .then((t) => { if (alive) setLedger({ slug, tickets: t }); })
      .catch(() => { if (alive) setLedger({ slug, tickets: [] }); });
    return () => { alive = false; };
  }, [slug]);

  const totals = useMemo(() => {
    const success = tickets.filter((t) => t.status === "success");
    return {
      revenue: success.reduce((sum, t) => sum + t.amountPesewas, 0),
      sold: success.reduce((sum, t) => sum + t.qty, 0),
      admitted: success.filter((t) => t.checkedInAt).length,
    };
  }, [tickets]);

  async function checkIn() {
    const c = code.trim().toUpperCase();
    if (!c) return;
    setChecking(true);
    setResult(null);
    try {
      const t = await api.checkIn(c);
      setResult({ ok: true, msg: `Admitted — ${t.qty} × ${t.tier} · ${t.eventTitle}` });
      setCode("");
      // Refresh the ledger so the admitted row updates in place.
      if (slug) api.eventTickets(slug).then((t) => setLedger({ slug, tickets: t })).catch(() => {});
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not check that code.";
      setResult({ ok: false, msg });
    } finally {
      setChecking(false);
    }
  }

  function renderLedger() {
    if (loading) {
      return <p className="py-8 text-center text-sm text-ink-muted">Loading sales…</p>;
    }
    if (tickets.length === 0) {
      return <Empty title="No sales yet">When members buy tickets for this event, every transaction lands here.</Empty>;
    }
    return (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[48rem] text-sm">
                <thead>
                  <tr className="border-b border-sand text-left text-[0.65rem] font-bold uppercase tracking-wider text-ink-faint">
                    <th className="px-4 py-3">Buyer</th>
                    <th className="px-4 py-3">Tier</th>
                    <th className="px-4 py-3">Qty</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Checked in</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <Stagger as="tbody" className="divide-y divide-sand">
                  {tickets.map((t, idx) => (
                    <StaggerItem as="tr" key={t.id} index={idx} className="hover:bg-paper">
                      <td className="px-4 py-3 text-ink-muted">{t.memberId || <span className="text-ink-faint">—</span>}</td>
                      <td className="px-4 py-3 font-medium text-ink">{t.tier}</td>
                      <td className="px-4 py-3 text-ink-muted">{t.qty}</td>
                      <td className="px-4 py-3 font-semibold text-green">{cedis(t.amountPesewas)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold capitalize ${STATUS_TONE[t.status]}`}>{t.status}</span>
                        {t.simulated && <span className="ml-1.5 text-[0.6rem] font-bold uppercase tracking-wide text-ink-faint">sim</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs tracking-widest text-ink">{t.code || <span className="font-sans text-ink-faint">—</span>}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-faint">{t.checkedInAt ? formatDate(t.checkedInAt) : "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-faint">{formatDate(t.confirmedAt ?? t.createdAt)}</td>
                    </StaggerItem>
                  ))}
                </Stagger>
              </table>
            </Card>
    );
  }

  return (
    <>
      <PageHeader kicker="Event ticketing" title="Tickets & gate" />

      {/* check-in box */}
      <Card className="mb-6 p-5">
        <h2 className="text-lg font-semibold text-ink">Gate check-in</h2>
        <p className="mt-1 text-sm text-ink-muted">Enter or paste the 8-letter code from the buyer&rsquo;s ticket.</p>
        <div className="mt-3 flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === "Enter") checkIn(); }}
            maxLength={8}
            placeholder="AB12CD34"
            className="w-40 rounded-lg border border-sand bg-paper px-3 py-2 font-mono text-lg tracking-widest text-ink focus:border-green focus:outline-none"
          />
          <button onClick={checkIn} disabled={checking || code.trim().length === 0} className="rounded-full bg-green px-5 py-2 text-sm font-semibold text-cream hover:bg-green-900 disabled:opacity-60">
            {checking ? "Checking…" : "Admit"}
          </button>
        </div>
        {result && (
          <p className={`mt-3 rounded-lg px-3 py-2 text-sm font-medium ${result.ok ? "bg-green/[0.08] text-green" : "bg-maroon-900/[0.08] text-maroon-900"}`}>
            {result.msg}
          </p>
        )}
      </Card>

      {/* event selector */}
      {events.length === 0 ? (
        <Empty title="No ticketed events">Add a tiers list to an event listing and its sales appear here.</Empty>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {events.map((e) => (
              <button key={e.id} onClick={() => setSlug(e.slug)} className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${slug === e.slug ? "border-green bg-green text-cream" : "border-sand bg-paper text-ink-muted hover:border-green/40"}`}>
                {e.title}
              </button>
            ))}
          </div>

          <Stagger className="mb-6 grid grid-cols-3 gap-4">
            <StaggerItem index={0}><MetricCard label="Revenue (confirmed)" value={cedis(totals.revenue)} tone="green" icon={<Banknote size={18} />} /></StaggerItem>
            <StaggerItem index={1}><MetricCard label="Tickets sold" value={totals.sold} tone="teal" icon={<TicketIcon size={18} />} /></StaggerItem>
            <StaggerItem index={2}><MetricCard label="Admitted" value={totals.admitted} tone="gold" icon={<DoorOpen size={18} />} /></StaggerItem>
          </Stagger>

          {renderLedger()}
        </>
      )}
    </>
  );
}
