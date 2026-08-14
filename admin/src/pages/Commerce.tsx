import { useMemo, useState, type ReactNode } from "react";
import { useLoaderData } from "react-router-dom";
import { BadgeCheck, Banknote, HandCoins, Percent, ReceiptText, ShoppingBag, Store, Tags, UsersRound } from "lucide-react";
import { api } from "@/lib/api";
import type { Affiliate, AffiliateConversion, AffiliateProgramme, BusinessVerification, CommerceOrder, CommercePromotion } from "@/lib/types";
import { Empty, PageHeader, Pill, Select } from "@/components/ui";
import { MetricCard } from "@/components/metric-card";
import { Stagger, StaggerItem } from "@/components/motion";

type Data = { verifications: BusinessVerification[]; orders: CommerceOrder[]; promotions: CommercePromotion[]; programmes: AffiliateProgramme[]; affiliates: Affiliate[]; conversions: AffiliateConversion[] };

export async function loader(): Promise<Data> {
  const [verifications, orders, promotions, programmes, conversions] = await Promise.all([api.businessVerifications(), api.commerceOrders(), api.commercePromotions(), api.affiliateProgrammes(), api.affiliateConversions()]);
  const affiliates = (await Promise.all(programmes.map((programme) => api.affiliates(programme.id!).catch(() => [])))).flat();
  return { verifications, orders, promotions, programmes, affiliates, conversions };
}

const cedis = (n = 0) => `GH₵ ${(n / 100).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const field = "mt-1.5 w-full rounded-xl border border-sand bg-cream px-3.5 py-2.5 text-sm text-ink shadow-sm placeholder:text-ink-faint focus:border-gold-border focus:outline-none focus:ring-2 focus:ring-gold/15";

function Watermark({ children, className }: Readonly<{ children: ReactNode; className: string }>) {
  return <span aria-hidden className={`pointer-events-none absolute select-none opacity-[0.055] ${className}`}>{children}</span>;
}

export function Component() {
  const initial = useLoaderData() as Data;
  const [verifications, setVerifications] = useState(initial.verifications);
  const [busy, setBusy] = useState("");
  const [promotions, setPromotions] = useState(initial.promotions);
  const [promo, setPromo] = useState<CommercePromotion>({ code: "", title: "", discountType: "percent", discountValue: 5, active: true });
  const [programmes, setProgrammes] = useState(initial.programmes);
  const [programme, setProgramme] = useState<AffiliateProgramme>({ name: "Oguaa ambassadors", commissionBps: 500, fundingSource: "platform", holdDays: 14, active: true });

  const confirmed = useMemo(() => initial.orders.filter((order) => order.status !== "pending"), [initial.orders]);
  const gross = confirmed.reduce((sum, order) => sum + order.amountPesewas, 0);
  const fees = confirmed.reduce((sum, order) => sum + order.platformFeePesewas, 0);
  const businessNet = confirmed.reduce((sum, order) => sum + order.businessNetPesewas, 0);
  const pendingChecks = verifications.filter((row) => row.status === "pending").length;
  const platformPromotions = promotions.filter((row) => row.ownerType === "platform");

  async function decide(v: BusinessVerification, status: "verified" | "rejected" | "revoked") {
    const note = status === "verified" ? "Identity, registration and settlement evidence reviewed." : window.prompt("Reviewer note") ?? "";
    if (status !== "verified" && !note) return;
    setBusy(v.listingId);
    try {
      const next = await api.reviewBusinessVerification(v.listingId, status, note);
      setVerifications((rows) => rows.map((row) => row.listingId === v.listingId ? next : row));
    } finally { setBusy(""); }
  }

  async function launchPromotion() {
    if (!promo.title?.trim() || !promo.code.trim()) return;
    const saved = await api.saveCommercePromotion(promo);
    setPromotions((rows) => [saved, ...rows]);
    setPromo((current) => ({ ...current, code: "", title: "" }));
  }

  async function saveProgramme() {
    if (!programme.name.trim()) return;
    const saved = await api.saveAffiliateProgramme(programme);
    setProgrammes((rows) => [saved, ...rows]);
  }

  return <>
    <PageHeader kicker="Marketplace operations" title="Business commerce" />

    <section className="relative mb-6 overflow-hidden rounded-[1.4rem] border border-green/20 bg-green p-6 text-on-green shadow-[0_18px_44px_-28px_rgba(12,44,31,0.8)] sm:p-8">
      <Watermark className="-bottom-14 -right-8 text-gold"><ShoppingBag size={230} strokeWidth={0.8} /></Watermark>
      <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="max-w-2xl">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-gold/30 bg-gold/15 text-gold"><Store size={22} /></div>
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-gold">Commerce command desk</p>
          <h2 className="mt-2 text-3xl font-semibold leading-tight sm:text-4xl">Trust, settlement and growth in one ledger.</h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-on-green/70">Review businesses before money moves, watch every split, and run platform-funded offers without reducing a merchant’s agreed settlement.</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs lg:w-[24rem]">
          <HeroFact label="Awaiting review" value={String(pendingChecks)} />
          <HeroFact label="Live offers" value={String(platformPromotions.filter((row) => row.active).length)} />
          <HeroFact label="Active partners" value={String(initial.affiliates.filter((row) => row.active).length)} />
        </div>
      </div>
    </section>

    <Stagger className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StaggerItem index={0}><MetricCard label="Confirmed GMV" value={cedis(gross)} sub={`${confirmed.length} settled orders`} tone="green" icon={<Banknote size={18} />} /></StaggerItem>
      <StaggerItem index={1}><MetricCard label="Oguaa commerce fees" value={cedis(fees)} sub="Confirmed platform income" tone="gold" icon={<HandCoins size={18} />} /></StaggerItem>
      <StaggerItem index={2}><MetricCard label="Business settlement" value={cedis(businessNet)} sub="Net routed to merchants" tone="teal" icon={<Store size={18} />} /></StaggerItem>
      <StaggerItem index={3}><MetricCard label="Verification queue" value={pendingChecks} sub={`${verifications.length} total applications`} tone={pendingChecks ? "clay" : "ink"} icon={<BadgeCheck size={18} />} /></StaggerItem>
    </Stagger>

    <section className="mt-8 grid gap-6 xl:grid-cols-2">
      <Panel watermark={<Percent size={126} strokeWidth={0.9} />} watermarkClass="-right-7 top-2 text-gold" heading={<SectionHeading icon={<Tags size={18} />} kicker="Platform-funded" title="Oguaa promotions">Discounts come from Oguaa’s fee, never the business settlement.</SectionHeading>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Campaign name"><input aria-label="Promotion title" placeholder="Cape Coast weekend" value={promo.title} onChange={(e) => setPromo({ ...promo, title: e.target.value })} className={field} /></Field>
          <Field label="Coupon code"><input aria-label="Promotion code" placeholder="OGUAA5" value={promo.code} onChange={(e) => setPromo({ ...promo, code: e.target.value.toUpperCase() })} className={field} /></Field>
          <Field label="Discount type"><Select aria-label="Discount type" value={promo.discountType} onValueChange={(discountType) => setPromo({ ...promo, discountType: discountType as "percent" | "fixed" })} className="mt-1.5 w-full"><option value="percent">Percentage</option><option value="fixed">Fixed pesewas</option></Select></Field>
          <Field label="Discount value"><input aria-label="Discount value" type="number" min={1} value={promo.discountValue} onChange={(e) => setPromo({ ...promo, discountValue: Number(e.target.value) })} className={field} /></Field>
        </div>
        <button type="button" onClick={launchPromotion} disabled={!promo.title?.trim() || !promo.code.trim()} className="mt-4 rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-on-green hover:bg-green-900 disabled:cursor-not-allowed disabled:opacity-45">Launch promotion</button>
        <div className="mt-5 border-t border-sand pt-4">{platformPromotions.length === 0 ? <Empty compact icon="megaphone" title="No Oguaa promotions yet">Launch an offer above; usage and funding remain visible here.</Empty> : <div className="space-y-2">{platformPromotions.map((row) => <div key={row.id} className="flex items-center justify-between gap-3 rounded-xl border border-sand bg-paper px-3.5 py-3 text-sm"><div><p className="font-semibold text-ink">{row.title || row.code}</p><p className="mt-0.5 text-xs text-ink-faint">{row.code} · {row.redemptions ?? 0} uses</p></div><Pill tone={row.active ? "green" : "neutral"}>{row.discountValue}{row.discountType === "percent" ? "%" : "p"}</Pill></div>)}</div>}</div>
      </Panel>

      <Panel watermark={<UsersRound size={148} strokeWidth={0.85} />} watermarkClass="-bottom-10 -right-8 text-teal" heading={<SectionHeading icon={<UsersRound size={18} />} kicker="Partner sales" title="Affiliate programme">Set the commission held by Oguaa until each return window closes.</SectionHeading>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Programme name"><input aria-label="Programme name" value={programme.name} onChange={(e) => setProgramme({ ...programme, name: e.target.value })} className={field} /></Field>
          <Field label="Commission percent"><input aria-label="Commission percent" type="number" min={0} max={100} value={programme.commissionBps / 100} onChange={(e) => setProgramme({ ...programme, commissionBps: Number(e.target.value) * 100 })} className={field} /></Field>
        </div>
        <button type="button" onClick={saveProgramme} disabled={!programme.name.trim()} className="mt-4 rounded-full bg-teal px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal/90 disabled:opacity-45">Save programme</button>
        <div className="mt-5 border-t border-sand pt-4">{initial.affiliates.length === 0 ? <Empty compact icon="users" title="No approved affiliates yet">Approved platform partners and their payout readiness appear here.</Empty> : <div className="grid gap-2 sm:grid-cols-2">{initial.affiliates.map((row) => <div key={row.id} className="rounded-xl border border-sand bg-paper px-3.5 py-3 text-sm"><div className="flex justify-between gap-2"><p className="font-semibold text-ink">{row.name}</p><Pill tone={row.active ? "green" : "neutral"}>{row.status ?? (row.active ? "approved" : "paused")}</Pill></div><p className="mt-1 text-xs text-ink-faint">{row.code} · {row.email}</p><p className="mt-1 text-xs text-ink-muted">{row.payoutPhone || "Payout profile incomplete"}</p></div>)}</div>}<p className="mt-3 text-xs text-ink-faint">{programmes.length} configured {programmes.length === 1 ? "programme" : "programmes"}</p><div className="mt-4 space-y-2">{initial.conversions.map((conversion) => <div key={conversion.id} className="flex items-center justify-between gap-3 rounded-xl border border-sand bg-paper px-3.5 py-3 text-sm"><div><p className="font-semibold text-ink">{conversion.affiliateCode}</p><p className="text-xs text-ink-faint">{cedis(conversion.commissionPesewas)} · {conversion.status}</p></div>{conversion.status === "converted" && <button type="button" onClick={() => api.setAffiliateConversionStatus(conversion.id, "payable")} className="rounded-full border border-teal/30 px-3 py-1.5 text-xs font-semibold text-teal-text">Release</button>}</div>)}</div></div>
      </Panel>
    </section>

    <section className="mt-10">
      <SectionBar heading={<SectionHeading icon={<BadgeCheck size={18} />} kicker="Trust gate" title="Verification queue">Only approved businesses receive a Paystack subaccount and checkout access.</SectionHeading>} meta={`${pendingChecks} awaiting review`} />
      {verifications.length === 0 ? <Empty icon="shield" title="No verification applications">When a business submits registration, identity documents and settlement details, the review pack will appear here.</Empty> : <Stagger className="grid gap-4 xl:grid-cols-2">{verifications.map((verification, index) => <StaggerItem as="article" index={index} key={verification.id} className="relative overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream p-5 shadow-[var(--shadow-card)]"><Watermark className="-bottom-7 -right-5 text-green"><BadgeCheck size={104} strokeWidth={0.9} /></Watermark><div className="relative"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-xl font-semibold text-ink">{verification.legalName}</h3><p className="mt-1 text-sm text-ink-muted">{verification.registrationNumber} · {verification.ghanaPostGPS}</p></div><Pill tone={verification.status === "verified" ? "green" : "neutral"}>{verification.status}</Pill></div><dl className="mt-5 grid gap-3 rounded-xl border border-sand bg-paper p-4 text-sm sm:grid-cols-2"><Key label="Ghana Card" value={verification.ghanaCardNumber} /><Key label="Settlement account" value={`${verification.settlementName} · •••${verification.settlementAccountNo.slice(-4)}`} /><Key label="Business phone" value={verification.businessPhone} /><Key label="Evidence" value={`${verification.documents.length} documents`} /></dl><div className="mt-4 flex flex-wrap gap-3">{verification.documents.map((document, i) => <a key={document} href={document} target="_blank" rel="noreferrer" className="text-xs font-semibold text-teal-text underline underline-offset-4">Document {i + 1} ↗</a>)}</div><div className="mt-5 flex flex-wrap gap-2"><button type="button" disabled={busy === verification.listingId} onClick={() => decide(verification, "verified")} className="rounded-full bg-green px-4 py-2 text-sm font-semibold text-on-green disabled:opacity-50">Verify &amp; provision</button><button type="button" disabled={busy === verification.listingId} onClick={() => decide(verification, "rejected")} className="rounded-full border border-clay/50 px-4 py-2 text-sm font-semibold text-clay-text disabled:opacity-50">Reject</button>{verification.status === "verified" && <button type="button" onClick={() => decide(verification, "revoked")} className="rounded-full border border-maroon-text/40 px-4 py-2 text-sm font-semibold text-maroon-text">Revoke</button>}</div></div></StaggerItem>)}</Stagger>}
    </section>

    <section className="mt-10">
      <SectionBar heading={<SectionHeading icon={<ReceiptText size={18} />} kicker="Settlement ledger" title="Recent orders">Every customer charge, Oguaa fee and business net amount stays visible.</SectionHeading>} />
      {initial.orders.length === 0 ? <Empty icon="money" title="No marketplace orders yet">Verified storefront checkouts will land here after Paystack confirmation, with the split recorded in pesewas.</Empty> : <div className="overflow-x-auto rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)]"><table className="w-full min-w-[54rem] text-left text-sm"><thead><tr className="border-b border-sand bg-paper text-[0.65rem] font-bold uppercase tracking-wider text-ink-faint"><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Business</th><th className="px-4 py-3">Buyer</th><th className="px-4 py-3">Gross</th><th className="px-4 py-3">Oguaa fee</th><th className="px-4 py-3">Business net</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-sand">{initial.orders.map((order) => <tr key={order.id} className="hover:bg-paper"><td className="px-4 py-3 font-medium">{order.reference}</td><td className="px-4 py-3">{order.businessName}</td><td className="px-4 py-3 text-ink-muted">{order.buyerName}</td><td className="px-4 py-3 font-semibold">{cedis(order.amountPesewas)}</td><td className="px-4 py-3 font-semibold text-gold-text">{cedis(order.platformFeePesewas)}</td><td className="px-4 py-3 font-semibold text-teal-text">{cedis(order.businessNetPesewas)}</td><td className="px-4 py-3"><Pill tone={order.status === "success" ? "green" : "neutral"}>{order.status}</Pill></td></tr>)}</tbody></table></div>}
    </section>
  </>;
}

function HeroFact({ label, value }: Readonly<{ label: string; value: string }>) { return <div className="rounded-xl border border-on-green/15 bg-on-green/[0.07] px-3 py-3 backdrop-blur-sm"><p className="text-xl font-semibold text-gold">{value}</p><p className="mt-0.5 text-[0.62rem] font-bold uppercase tracking-wider text-on-green/60">{label}</p></div>; }
function SectionHeading({ icon, kicker, title, children }: Readonly<{ icon: ReactNode; kicker: string; title: string; children: ReactNode }>) { return <div className="flex gap-3"><span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gold/25 bg-gold/[0.1] text-gold-text">{icon}</span><div><p className="text-[0.62rem] font-bold uppercase tracking-[0.18em] text-gold-text">{kicker}</p><h2 className="mt-1 text-2xl font-semibold text-ink">{title}</h2><p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-muted">{children}</p></div></div>; }
function Panel({ watermark, watermarkClass, heading, children }: Readonly<{ watermark: ReactNode; watermarkClass: string; heading: ReactNode; children: ReactNode }>) { return <div className="relative overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream p-5 shadow-[var(--shadow-card)] sm:p-6"><Watermark className={watermarkClass}>{watermark}</Watermark><div className="relative">{heading}<div className="mt-5">{children}</div></div></div>; }
function Field({ label, children }: Readonly<{ label: string; children: ReactNode }>) { return <label className="text-xs font-semibold text-ink-muted">{label}{children}</label>; }
function SectionBar({ heading, meta }: Readonly<{ heading: ReactNode; meta?: string }>) { return <div className="mb-4 flex flex-wrap items-end justify-between gap-3">{heading}{meta && <span className="rounded-full border border-sand bg-cream px-3 py-1.5 text-xs font-semibold text-ink-muted">{meta}</span>}</div>; }
function Key({ label, value }: Readonly<{ label: string; value: string }>) { return <div><dt className="text-xs text-ink-faint">{label}</dt><dd className="mt-1 font-medium text-ink">{value}</dd></div>; }
