import { useEffect, useState, type ReactNode } from "react";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router-dom";
import { api } from "@/lib/api";
import type { Affiliate, AffiliateConversion, AffiliateProgramme, BusinessCoupon, BusinessVerification, CommerceOrder, Listing, PaymentBank, PaymentBankType } from "@/lib/types";
import { paymentErrorMessage } from "@/lib/payments";
import { Container } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { usePageTitle } from "@/lib/use-page-title";
import { PrivateDocumentUpload } from "@/components/private-document-upload";

/** The three KYC documents, each a private upload (K8). */
const KYC_DOCUMENTS = ["Business registration certificate", "Ghana Card — front", "Ghana Card — back"] as const;

type KycText = {
  legalName: string; registrationNumber: string; taxIdentificationNo: string; ghanaCardNumber: string; businessPhone: string;
  businessEmail: string; ghanaPostGPS: string; settlementBankCode: string; settlementAccountNo: string; settlementName: string;
};

/** Each KYC field with an honest purpose line and a required/optional marker (G094). */
const KYC_FIELDS: { key: keyof KycText; label: string; hint: string; required: boolean; type?: string }[] = [
  { key: "legalName", label: "Registered business name", hint: "Shown to buyers as the seller on your product pages.", required: true },
  { key: "registrationNumber", label: "Registrar-General number", hint: "Shown to buyers so they know who they are buying from.", required: true },
  { key: "taxIdentificationNo", label: "TIN", hint: "For tax records. Never shown publicly.", required: false },
  { key: "ghanaCardNumber", label: "Owner's Ghana Card number", hint: "Used only to verify you. Never shown publicly.", required: true },
  { key: "businessPhone", label: "Business phone", hint: "Shown to buyers as the seller's contact.", required: true, type: "tel" },
  { key: "businessEmail", label: "Business email", hint: "Shown to buyers as the seller's contact.", required: false, type: "email" },
  { key: "ghanaPostGPS", label: "GhanaPost GPS address", hint: "Shown to buyers as the seller's location.", required: true },
];

/** Where a seller is paid out: the settlement fields, kept apart from the KYC text fields. */
type Settlement = Pick<KycText, "settlementBankCode" | "settlementAccountNo" | "settlementName">;

const SETTLEMENT_KINDS: { kind: PaymentBankType; label: string; picker: string; account: string; accountHint: string; nameHint: string }[] = [
  { kind: "bank", label: "Bank account", picker: "Bank", account: "Account number", accountHint: "Your bank account number.", nameHint: "As your bank has it registered." },
  { kind: "mobile_money", label: "Mobile Money", picker: "Mobile Money network", account: "Mobile Money number", accountHint: "The wallet's phone number, e.g. 024 123 4567.", nameHint: "As the wallet is registered with the network." },
];

type BankLists = Record<PaymentBankType, PaymentBank[]>;

/** Paystack's Ghana banks and Mobile Money networks, with a retry for a failed load. */
function usePaymentBanks() {
  const [lists, setLists] = useState<BankLists | null>(null);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    const loaded = (next: BankLists) => { if (alive) { setLists(next); setLoadError(""); } };
    const failed = (e: unknown) => { if (alive) setLoadError(paymentErrorMessage(e, "We couldn't load the list of banks.")); };
    Promise.all([api.paymentBanks("bank"), api.paymentBanks("mobile_money")])
      .then(([bank, mobileMoney]) => loaded({ bank, mobile_money: mobileMoney }))
      .catch(failed);
    return () => { alive = false; };
  }, [attempt]);
  return { lists, loadError, retry: () => setAttempt((n) => n + 1) };
}

function SettlementKindToggle({ kind, onPick }: Readonly<{ kind: PaymentBankType; onPick: (kind: PaymentBankType) => void }>) {
  return (
    <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Settlement account type">
      {SETTLEMENT_KINDS.map((k) => (
        <button key={k.kind} type="button" aria-pressed={kind === k.kind} onClick={() => onPick(k.kind)}
          className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${kind === k.kind ? "border-green bg-green text-on-green" : "border-sand bg-cream text-ink-muted hover:border-green/40"}`}>
          {k.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The settlement destination, picked from Paystack's own list of Ghana banks
 * and Mobile Money networks (contract C2) — the server rejects any other code.
 */
function SettlementFields({ value, onChange }: Readonly<{ value: Settlement; onChange: (next: Settlement) => void }>) {
  const { lists, loadError, retry } = usePaymentBanks();
  const [chosenKind, setChosenKind] = useState<PaymentBankType | null>(null);

  // Until the seller picks, show the kind their saved code belongs to.
  const savedInMoMo = lists?.mobile_money.some((b) => b.code === value.settlementBankCode) ?? false;
  const kind = chosenKind ?? (savedInMoMo ? "mobile_money" : "bank");
  const meta = SETTLEMENT_KINDS.find((k) => k.kind === kind)!;
  const options = lists?.[kind] ?? [];
  const selected = options.some((b) => b.code === value.settlementBankCode) ? value.settlementBankCode : "";
  const pickKind = (next: PaymentBankType) => {
    setChosenKind(next);
    if (next !== kind) onChange({ ...value, settlementBankCode: "" });
  };

  return (
    <fieldset className="mt-6 rounded-lg border border-sand bg-paper/60 p-4">
      <legend className="px-1 text-sm font-semibold text-ink">Where your sales are paid</legend>
      <p className="text-xs text-ink-faint">
        Sent to Paystack so your share of each sale is paid to you. Never shown publicly. Paystack&rsquo;s processing fee is taken out of your share before it reaches this account.
      </p>
      <SettlementKindToggle kind={kind} onPick={pickKind} />
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink">{meta.picker} <span className="font-normal text-ink-faint">(required)</span></span>
          <select required value={selected} disabled={!lists} onChange={(e) => onChange({ ...value, settlementBankCode: e.target.value })} className={field}>
            <option value="">{lists ? `Choose your ${meta.picker.toLowerCase()}` : "Loading…"}</option>
            {options.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink">{meta.account} <span className="font-normal text-ink-faint">(required)</span></span>
          <input required inputMode="numeric" value={value.settlementAccountNo} onChange={(e) => onChange({ ...value, settlementAccountNo: e.target.value })} className={field} />
          <span className="mt-1 block text-xs text-ink-faint">{meta.accountHint}</span>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink">Account name <span className="font-normal text-ink-faint">(required)</span></span>
          <input required value={value.settlementName} onChange={(e) => onChange({ ...value, settlementName: e.target.value })} className={field} />
          <span className="mt-1 block text-xs text-ink-faint">{meta.nameHint}</span>
        </label>
      </div>
      {value.settlementBankCode && lists && !selected && (
        <p className="mt-3 text-sm text-clay-text">Your saved settlement code isn&rsquo;t on Paystack&rsquo;s list. Choose your {meta.picker.toLowerCase()} again.</p>
      )}
      {loadError && (
        <p role="alert" className="mt-3 text-sm text-clay-text">
          {loadError}{" "}
          <button type="button" onClick={retry} className="font-semibold underline">Try again</button>
        </p>
      )}
    </fieldset>
  );
}

function KycSection({ listingId, verification, onSubmitted }: Readonly<{ listingId: string; verification: BusinessVerification | null; onSubmitted: (v: BusinessVerification, message: string) => void }>) {
  const [kyc, setKyc] = useState<KycText>({
    legalName: verification?.legalName ?? "", registrationNumber: verification?.registrationNumber ?? "", taxIdentificationNo: verification?.taxIdentificationNo ?? "",
    ghanaCardNumber: verification?.ghanaCardNumber ?? "", businessPhone: verification?.businessPhone ?? "", businessEmail: verification?.businessEmail ?? "",
    ghanaPostGPS: verification?.ghanaPostGPS ?? "", settlementBankCode: verification?.settlementBankCode ?? "", settlementAccountNo: verification?.settlementAccountNo ?? "",
    settlementName: verification?.settlementName ?? "",
  });
  const [documents, setDocuments] = useState<string[]>(() => KYC_DOCUMENTS.map((_, i) => verification?.documents[i] ?? ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (documents.some((d) => !d)) { setError("Upload all three documents first."); return; }
    if (!kyc.settlementBankCode) { setError("Choose your bank or Mobile Money network from the list."); return; }
    setBusy(true); setError("");
    try {
      onSubmitted(await api.submitBusinessVerification(listingId, { ...kyc, businessEmail: kyc.businessEmail || undefined, documents }), "Verification submitted for review.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit verification.");
    } finally { setBusy(false); }
  }

  return (
    <>
      <p className="mt-3 text-sm text-ink-muted">
        We need these details to verify your business before online checkout opens. Buyers see your registered name, registration number,
        location and business contacts; everything else stays private to you, Oguaa&rsquo;s vetting staff and Paystack.
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {KYC_FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="mb-1 block text-sm font-medium text-ink">{f.label} <span className="font-normal text-ink-faint">({f.required ? "required" : "optional"})</span></span>
            <input type={f.type ?? "text"} required={f.required} value={kyc[f.key]} onChange={(e) => setKyc({ ...kyc, [f.key]: e.target.value })} className={field} />
            <span className="mt-1 block text-xs text-ink-faint">{f.hint}</span>
          </label>
        ))}
      </div>
      <SettlementFields value={kyc} onChange={(next) => setKyc({ ...kyc, ...next })} />
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {KYC_DOCUMENTS.map((label, i) => (
          <PrivateDocumentUpload
            key={label}
            label={label}
            required
            purpose="business_kyc"
            value={documents[i]}
            onChange={(ref) => setDocuments((rows) => rows.map((r, j) => (j === i ? ref : r)))}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-faint">Documents are stored encrypted and seen only by you and Oguaa&rsquo;s vetting staff — never at a public link.</p>
      {error && <p role="alert" className="mt-3 text-sm text-clay-text">{error}</p>}
      <button type="button" onClick={submit} disabled={busy} className="mt-4 rounded-full bg-green px-5 py-2.5 font-semibold text-on-green disabled:opacity-60">{busy ? "Submitting…" : "Submit for verification"}</button>
    </>
  );
}

export async function loader({ params }: LoaderFunctionArgs) {
  const business = await api.business(params.slug!);
  const [verification, orders, coupons, programmes, conversions] = await Promise.all([
    api.businessVerification(business.id).catch(() => null), api.businessOrders(business.id).catch(() => []), api.businessCoupons(business.id).catch(() => []), api.affiliateProgrammes(business.id).catch(() => []), api.affiliateConversions(business.id).catch(() => []),
  ]);
  const affiliates = (await Promise.all(programmes.map((programme) => api.affiliates(business.id, programme.id!).catch(() => [])))).flat();
  return { business, verification, orders, coupons, programmes, affiliates, conversions };
}
const field = "w-full rounded-lg border border-sand bg-paper px-3.5 py-2.5 text-sm text-ink";
const NEW_PROGRAMME: AffiliateProgramme = { name: "Store ambassadors", description: "Reward trusted partners for qualified product sales.", commissionBps: 1000, cookieWindowDays: 30, holdDays: 14, minimumPayoutPesewas: 5000, payoutMode: "mobile_money", active: true };
/** Cedis → pesewas or percent → basis points, as the integer the API requires. */
const hundredths = (value: string) => Math.round(Number(value) * 100);
const wholeNumber = (value: string) => Math.round(Number(value));
const cedis = (pesewas: number) => `GH₵ ${(pesewas / 100).toFixed(2)}`;
// Only a paid order can move forward, one step at a time (server rule).
const NEXT_STATUS: Partial<Record<CommerceOrder["status"], CommerceOrder["status"]>> = { paid: "processing", processing: "ready", ready: "fulfilled" };
const UNPAID_STATUSES = new Set<CommerceOrder["status"]>(["pending", "cancelled"]);
export function Component() {
  const initial = useLoaderData() as { business: Listing; verification: BusinessVerification | null; orders: CommerceOrder[]; coupons: BusinessCoupon[]; programmes: AffiliateProgramme[]; affiliates: Affiliate[]; conversions: AffiliateConversion[] };
  const { member } = useAuth(); usePageTitle(`Commerce · ${initial.business.title}`);
  const [verification, setVerification] = useState(initial.verification); const [orders, setOrders] = useState(initial.orders); const [coupons, setCoupons] = useState(initial.coupons); const [message, setMessage] = useState("");
  const [coupon, setCoupon] = useState<BusinessCoupon>({ code: "", discountType: "percent", discountValue: 10, active: true });
  const [programmes, setProgrammes] = useState(initial.programmes); const [conversions] = useState(initial.conversions);
  const [programme, setProgramme] = useState<AffiliateProgramme>(() => initial.programmes[0] ?? NEW_PROGRAMME);
  const [affiliates, setAffiliates] = useState(initial.affiliates);
  const [affiliateStep, setAffiliateStep] = useState<"programme"|"partners"|"links"|"earnings">("programme");
  const [affiliate, setAffiliate] = useState<Affiliate>({ programmeId: initial.programmes[0]?.id ?? "", code: "", name: "", email: "", payoutPhone: "", promotionChannels: [], audienceSummary: "", status: "approved", active: true });
  if (!member || member.id !== initial.business.ownerId) return <Container className="py-20"><h1 className="text-4xl">Owner access required</h1></Container>;
  async function saveCoupon() { try { const saved = await api.saveBusinessCoupon(initial.business.id, coupon); setCoupons((rows) => [saved, ...rows.filter((x) => x.id !== saved.id)]); setCoupon({ code: "", discountType: "percent", discountValue: 10, active: true }); setMessage("Coupon saved."); } catch (e) { setMessage(e instanceof Error ? e.message : "Could not save coupon."); } }
  async function saveProgramme() { try { const saved=await api.saveAffiliateProgramme(initial.business.id,programme);setProgramme(saved);setProgrammes((rows)=>[saved,...rows.filter((x)=>x.id!==saved.id)]);setAffiliate((x)=>({...x,programmeId:saved.id!}));setMessage("Affiliate programme saved."); } catch(e){setMessage(e instanceof Error?e.message:"Could not save programme.")} }
  async function saveAffiliate(){try{const saved=await api.saveAffiliate(initial.business.id,affiliate);setAffiliates((rows)=>[saved,...rows.filter((row)=>row.id!==saved.id)]);setAffiliate({...affiliate,code:"",name:"",email:"",payoutPhone:"",audienceSummary:""});setMessage("Affiliate approved. Their tracked campaign link is ready.")}catch(e){setMessage(e instanceof Error?e.message:"Could not add affiliate.")}}
  async function advance(order: CommerceOrder, status: CommerceOrder["status"]) { try { await api.setBusinessOrderStatus(initial.business.id, order.id, status); setOrders((rows) => rows.map((x) => x.id === order.id ? { ...x, status } : x)); setMessage(`Order ${order.reference} marked ${status}.`); } catch (e) { setMessage(e instanceof Error ? e.message : "Could not update the order."); } }
  return <Container className="py-10"><Link to={`/business/${initial.business.slug}/manage`} className="text-sm font-semibold text-green-text">← Storefront editor</Link><h1 className="mt-4 text-4xl font-semibold">Commerce controls</h1><p className="mt-2 text-ink-muted">Private verification, Paystack settlement, orders and customer coupons for {initial.business.title}.</p>{message && <p role="status" className="mt-4 rounded-lg bg-gold/[0.1] p-3 text-sm text-gold-text">{message}</p>}
    <section className="mt-8 rounded-[var(--radius-card)] border border-sand bg-cream p-6"><div className="flex items-center justify-between gap-4"><div><p className="eyebrow">Trust &amp; settlement</p><h2 className="mt-1 text-2xl font-semibold">Business verification</h2></div><span className="rounded-full bg-paper px-3 py-1 text-xs font-semibold uppercase">{verification?.status ?? "not submitted"}</span></div>{verification?.reviewNote && <p className="mt-3 text-sm text-clay-text">Reviewer note: {verification.reviewNote}</p>}<KycSection listingId={initial.business.id} verification={verification} onSubmitted={(v, m) => { setVerification(v); setMessage(m); }} /></section>
    <section className="mt-8 rounded-[var(--radius-card)] border border-sand bg-cream p-6"><p className="eyebrow">Sales growth</p><h2 className="mt-1 text-2xl font-semibold">Coupons</h2><div className="mt-4 grid gap-3 sm:grid-cols-4"><input aria-label="Coupon code" placeholder="OGUAA10" value={coupon.code} onChange={(e) => setCoupon({ ...coupon, code: e.target.value.toUpperCase() })} className={field}/><select aria-label="Discount type" value={coupon.discountType} onChange={(e) => setCoupon({ ...coupon, discountType: e.target.value as "percent" | "fixed" })} className={field}><option value="percent">Percentage</option><option value="fixed">Fixed pesewas</option></select><input aria-label="Discount value" type="number" min="1" step="1" value={coupon.discountValue} onChange={(e) => setCoupon({ ...coupon, discountValue: wholeNumber(e.target.value) })} className={field}/><input aria-label="Redemption limit" type="number" min="0" step="1" placeholder="Limit (0 unlimited)" value={coupon.redemptionLimit ?? ""} onChange={(e) => setCoupon({ ...coupon, redemptionLimit: e.target.value === "" ? undefined : wholeNumber(e.target.value) })} className={field}/></div><button type="button" onClick={saveCoupon} className="mt-4 rounded-full bg-gold px-5 py-2.5 font-semibold text-green-900">Create coupon</button><div className="mt-5 grid gap-2">{coupons.map((c) => <div key={c.id} className="flex items-center justify-between rounded-lg border border-sand bg-paper p-3"><div><strong>{c.code}</strong><span className="ml-2 text-sm text-ink-muted">{c.discountType === "percent" ? `${c.discountValue}%` : `GH₵ ${(c.discountValue / 100).toFixed(2)}`} · {c.redemptions ?? 0} used</span></div><button type="button" onClick={async () => { await api.deleteBusinessCoupon(initial.business.id, c.id!); setCoupons((rows) => rows.filter((x) => x.id !== c.id)); }} className="text-sm font-semibold text-clay-text">Archive</button></div>)}</div></section>
    <section className="relative mt-8 overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream p-6"><Users aria-hidden className="pointer-events-none absolute -right-10 -top-8 h-48 w-48 text-teal opacity-[0.06]"/><div className="relative"><p className="eyebrow">Partner growth</p><h2 className="mt-1 text-3xl font-semibold">Affiliate marketing</h2><p className="mt-2 max-w-2xl text-sm text-ink-muted">Recruit trusted partners, issue persistent tracked links, review qualified sales and release commission after the return window.</p><div className="mt-5 flex gap-2 overflow-x-auto pb-1">{([['programme','1. Rules'],['partners','2. Partners'],['links','3. Links'],['earnings','4. Earnings']] as const).map(([id,label])=><button type="button" key={id} onClick={()=>setAffiliateStep(id)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${affiliateStep===id?'bg-green text-on-green':'border border-sand bg-paper text-ink-muted'}`}>{label}</button>)}</div>
    {affiliateStep==='programme'&&<div className="mt-6"><ProgrammePicker programmes={programmes} current={programme} onPick={setProgramme}/><div className="grid gap-3 sm:grid-cols-2"><input aria-label="Programme name" placeholder="Programme name" value={programme.name} onChange={(e)=>setProgramme({...programme,name:e.target.value})} className={field}/><input aria-label="Programme description" placeholder="What partners should promote" value={programme.description??''} onChange={(e)=>setProgramme({...programme,description:e.target.value})} className={field}/><input aria-label="Commission percent" type="number" min="0.01" max="50" value={programme.commissionBps/100} onChange={(e)=>setProgramme({...programme,commissionBps:hundredths(e.target.value)})} className={field}/><input aria-label="Cookie window days" type="number" min="1" max="365" value={programme.cookieWindowDays??30} onChange={(e)=>setProgramme({...programme,cookieWindowDays:wholeNumber(e.target.value)})} className={field}/><input aria-label="Hold days" type="number" min="0" max="180" value={programme.holdDays} onChange={(e)=>setProgramme({...programme,holdDays:wholeNumber(e.target.value)})} className={field}/><input aria-label="Minimum payout cedis" type="number" min="0" value={(programme.minimumPayoutPesewas??0)/100} onChange={(e)=>setProgramme({...programme,minimumPayoutPesewas:hundredths(e.target.value)})} className={field}/><label className="flex items-center gap-2 text-sm text-ink sm:col-span-2"><input type="checkbox" checked={programme.active} onChange={(e)=>setProgramme({...programme,active:e.target.checked})}/> Programme active (untick to stop paying commission on new sales)</label></div><button type="button" onClick={saveProgramme} className="mt-4 rounded-full bg-teal px-5 py-2.5 font-semibold text-white">{programme.id ? "Save programme rules" : "Create programme"}</button></div>}
    {affiliateStep==='partners'&&<div className="mt-6"><div className="grid gap-3 sm:grid-cols-2"><select aria-label="Affiliate programme" value={affiliate.programmeId} onChange={(e)=>setAffiliate({...affiliate,programmeId:e.target.value})} className={field}><option value="">Choose programme</option>{programmes.map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select><input aria-label="Affiliate code" placeholder="AMA10" value={affiliate.code} onChange={(e)=>setAffiliate({...affiliate,code:e.target.value.toUpperCase()})} className={field}/><input aria-label="Affiliate name" placeholder="Partner name" value={affiliate.name} onChange={(e)=>setAffiliate({...affiliate,name:e.target.value})} className={field}/><input aria-label="Affiliate email" type="email" placeholder="partner@example.com" value={affiliate.email} onChange={(e)=>setAffiliate({...affiliate,email:e.target.value})} className={field}/><input aria-label="Payout phone" placeholder="Mobile money number" value={affiliate.payoutPhone??''} onChange={(e)=>setAffiliate({...affiliate,payoutPhone:e.target.value})} className={field}/><input aria-label="Audience summary" placeholder="Audience and promotion approach" value={affiliate.audienceSummary??''} onChange={(e)=>setAffiliate({...affiliate,audienceSummary:e.target.value})} className={field}/></div><button type="button" disabled={!affiliate.programmeId||!affiliate.code||!affiliate.name||!affiliate.email} onClick={saveAffiliate} className="mt-4 rounded-full bg-green px-5 py-2.5 font-semibold text-on-green disabled:opacity-40">Approve affiliate</button><div className="mt-6 grid gap-3 sm:grid-cols-2">{affiliates.length===0?<p className="rounded-xl border border-dashed border-sand p-6 text-sm text-ink-muted">No affiliates yet. Add the first trusted partner above.</p>:affiliates.map((row)=><article key={row.id} className="rounded-xl border border-sand bg-paper p-4"><div className="flex justify-between gap-3"><div><strong>{row.name}</strong><p className="text-sm text-ink-muted">{row.email}</p></div><span className="h-fit rounded-full bg-teal/10 px-2.5 py-1 text-xs font-semibold text-teal-text">{row.code}</span></div><p className="mt-3 text-xs text-ink-faint">{row.status??(row.active?'approved':'paused')} · {row.payoutPhone||'Payout details pending'}</p></article>)}</div></div>}
    {affiliateStep==='links'&&<div className="mt-6 grid gap-3 sm:grid-cols-2">{affiliates.length===0?<p className="rounded-xl border border-dashed border-sand p-6 text-sm text-ink-muted">Approve a partner before creating tracked links.</p>:affiliates.map((row)=>{const url=`${window.location.origin}/business/${initial.business.slug}?aff=${row.code}`;return <article key={row.id} className="rounded-xl border border-sand bg-paper p-4"><Link2 className="mb-3 text-teal" size={20}/><strong>{row.name}'s main link</strong><p className="mt-2 break-all text-xs text-ink-muted">{url}</p><button type="button" onClick={()=>navigator.clipboard.writeText(url)} className="mt-3 inline-flex items-center gap-2 rounded-full border border-teal/30 px-3 py-1.5 text-xs font-semibold text-teal-text"><Copy size={13}/> Copy link</button></article>})}</div>}
    {affiliateStep==='earnings'&&<div className="mt-6"><div className="grid gap-3 sm:grid-cols-3"><AffiliateStat icon={<BarChart3 size={18}/>} label="Qualified sales" value={String(conversions.filter(c=>c.status!=='void').length)}/><AffiliateStat icon={<WalletCards size={18}/>} label="Pending commission" value={`GH₵ ${(conversions.filter(c=>c.status==='reserved'||c.status==='converted').reduce((n,c)=>n+c.commissionPesewas,0)/100).toFixed(2)}`}/><AffiliateStat icon={<WalletCards size={18}/>} label="Paid commission" value={`GH₵ ${(conversions.filter(c=>c.status==='paid').reduce((n,c)=>n+c.commissionPesewas,0)/100).toFixed(2)}`}/></div><div className="mt-4 space-y-2">{conversions.length===0?<p className="rounded-xl border border-dashed border-sand p-6 text-sm text-ink-muted">No attributed sales yet. Completed checkouts appear here automatically.</p>:conversions.map((c)=><p key={c.id} className="rounded-lg bg-paper p-3 text-sm"><strong>{c.affiliateCode}</strong> · {c.status} · GH₵ {(c.commissionPesewas/100).toFixed(2)} commission · {c.orderReference}</p>)}</div></div>}</div></section>
    <OrdersSection orders={orders} onAdvance={advance}/>
  </Container>;
}

function AffiliateStat({icon,label,value}:Readonly<{icon:ReactNode;label:string;value:string}>){return <div className="rounded-xl border border-sand bg-paper p-4"><span className="text-teal">{icon}</span><p className="mt-3 text-xs font-semibold uppercase tracking-wider text-ink-faint">{label}</p><p className="mt-1 text-xl font-semibold text-ink">{value}</p></div>}

type GlyphProps = Readonly<{ className?: string; size?: number; "aria-hidden"?: boolean }>;
function Glyph({ className = "", size = 18, children }: GlyphProps & { children: ReactNode }) { return <span aria-hidden className={`inline-grid place-items-center ${className}`} style={{ width: size, height: size }}>{children}</span>; }
function Users(props: GlyphProps) { return <Glyph {...props}>◎</Glyph>; }
function Link2(props: GlyphProps) { return <Glyph {...props}>↗</Glyph>; }
function Copy(props: GlyphProps) { return <Glyph {...props}>▣</Glyph>; }
function BarChart3(props: GlyphProps) { return <Glyph {...props}>▥</Glyph>; }
function WalletCards(props: GlyphProps) { return <Glyph {...props}>₵</Glyph>; }

function ProgrammePicker({ programmes, current, onPick }: Readonly<{ programmes: AffiliateProgramme[]; current: AffiliateProgramme; onPick: (p: AffiliateProgramme) => void }>) {
  if (programmes.length === 0) return <p className="mb-4 text-sm text-ink-muted">Set your first programme's rules below.</p>;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <label htmlFor="programme-picker" className="text-sm font-semibold text-ink">Editing</label>
      <select id="programme-picker" value={current.id ?? ""} onChange={(e) => onPick(programmes.find((p) => p.id === e.target.value) ?? { ...NEW_PROGRAMME })} className="rounded-lg border border-sand bg-paper px-3 py-2 text-sm text-ink">
        {programmes.map((p) => <option key={p.id} value={p.id}>{p.name}{p.active ? "" : " (inactive)"}</option>)}
        <option value="">New programme…</option>
      </select>
    </div>
  );
}

function OrdersSection({ orders, onAdvance }: Readonly<{ orders: CommerceOrder[]; onAdvance: (order: CommerceOrder, status: CommerceOrder["status"]) => void }>) {
  const paid = orders.filter((o) => !UNPAID_STATUSES.has(o.status));
  const unpaid = orders.filter((o) => UNPAID_STATUSES.has(o.status));
  return (
    <section className="mt-8 rounded-[var(--radius-card)] border border-sand bg-cream p-6">
      <p className="eyebrow">Fulfilment</p>
      <h2 className="mt-1 text-2xl font-semibold">Orders</h2>
      <div className="mt-5 space-y-3">
        {paid.length === 0 && <p className="text-ink-muted">Paid customer orders will appear here.</p>}
        {paid.map((o) => <OrderCard key={o.id} order={o} onAdvance={onAdvance} />)}
      </div>
      {unpaid.length > 0 && (
        <details className="mt-6 rounded-lg border border-dashed border-sand p-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink">Unpaid checkouts ({unpaid.length})</summary>
          <p className="mt-2 text-sm text-clay-text">These customers started a checkout but did not pay. Do not hand over goods for them.</p>
          <div className="mt-3 space-y-3">{unpaid.map((o) => <OrderCard key={o.id} order={o} onAdvance={onAdvance} />)}</div>
        </details>
      )}
    </section>
  );
}

function OrderCard({ order: o, onAdvance }: Readonly<{ order: CommerceOrder; onAdvance: (order: CommerceOrder, status: CommerceOrder["status"]) => void }>) {
  const next = NEXT_STATUS[o.status];
  const unpaid = UNPAID_STATUSES.has(o.status);
  return (
    <article className="rounded-lg border border-sand bg-paper p-4">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <strong>{o.reference}</strong>
          <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${unpaid ? "bg-clay/10 text-clay-text" : "bg-green/10 text-green-text"}`}>{unpaid ? `${o.status} · not paid` : o.status}</span>
          <p className="text-sm text-ink-muted">{[o.buyerName, o.buyerPhone, o.fulfilment].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="text-right">
          <strong>{cedis(o.amountPesewas)}</strong>
          {!unpaid && o.businessNetPesewas != null && <p className="text-xs text-ink-faint">You receive {cedis(o.businessNetPesewas)}, less Paystack&rsquo;s processing fee</p>}
        </div>
      </div>
      <p className="mt-2 text-sm">{o.lines.map((l) => `${l.quantity}× ${l.name}`).join(", ")}</p>
      {next && <button type="button" onClick={() => onAdvance(o, next)} className="mt-3 rounded-full border border-green px-3 py-1 text-xs font-semibold text-green-text hover:bg-green hover:text-on-green">Mark {next}</button>}
    </article>
  );
}
