import type { ReactNode } from "react";

export type EventAdmission = "free" | "paid";
export interface EventTierDraft { name: string; priceGhs: string; capacity: string }

export const EVENT_FORMATS = [
  { value: "festival", label: "Festival", hint: "A multi-part celebration", mark: "✦" },
  { value: "concert", label: "Concert", hint: "Live music or performance", mark: "♫" },
  { value: "workshop", label: "Workshop", hint: "Hands-on learning", mark: "✎" },
  { value: "conference", label: "Conference", hint: "Talks and professional exchange", mark: "◫" },
  { value: "community", label: "Community", hint: "A local gathering", mark: "◎" },
  { value: "sports", label: "Sports", hint: "Match, race or tournament", mark: "◉" },
  { value: "ceremony", label: "Ceremony", hint: "Formal or commemorative", mark: "♜" },
  { value: "exhibition", label: "Exhibition", hint: "Art, craft or showcase", mark: "◇" },
  { value: "nightlife", label: "Nightlife", hint: "Party or evening social", mark: "☾" },
  { value: "fundraiser", label: "Fundraiser", hint: "Gathering for a cause", mark: "♡" },
] as const;

export const EVENT_AUDIENCES = [
  { value: "all-ages", label: "All ages", mark: "◎" }, { value: "families", label: "Families", mark: "⌂" },
  { value: "adults", label: "Adults", mark: "18" }, { value: "children", label: "Children", mark: "☆" },
  { value: "students", label: "Students", mark: "⌑" }, { value: "professionals", label: "Professionals", mark: "▣" },
] as const;

const field = "w-full rounded-xl border border-sand bg-paper px-4 py-3 text-ink transition-colors placeholder:text-ink-faint focus:border-green focus:bg-cream focus:outline-none focus:ring-2 focus:ring-green/15";

function Label({ title, hint, children }: Readonly<{ title: string; hint?: string; children: ReactNode }>) {
  return <label className="block"><span className="mb-2 block text-sm font-semibold text-ink">{title}</span>{children}{hint && <span className="mt-1.5 block text-xs leading-relaxed text-ink-faint">{hint}</span>}</label>;
}

export function EventDetailsFields({ format, onFormat, audience, onAudience, admission, onAdmission, tiers, onTiers, initial }: Readonly<{
  format: string; onFormat: (value: string) => void; audience: string[]; onAudience: (value: string[]) => void;
  admission: EventAdmission; onAdmission: (value: EventAdmission) => void; tiers: EventTierDraft[]; onTiers: (value: EventTierDraft[]) => void;
  initial?: Record<string, unknown>;
}>) {
  const text = (key: string) => typeof initial?.[key] === "string" ? String(initial[key]) : "";
  const lines = (key: string) => Array.isArray(initial?.[key]) ? (initial?.[key] as unknown[]).filter((v): v is string => typeof v === "string").join("\n") : "";
  const toggleAudience = (value: string) => onAudience(audience.includes(value) ? audience.filter((item) => item !== value) : [...audience, value]);
  const updateTier = (index: number, patch: Partial<EventTierDraft>) => onTiers(tiers.map((tier, i) => i === index ? { ...tier, ...patch } : tier));
  return <div className="space-y-6">
    <fieldset><legend className="text-sm font-semibold text-ink">Event format</legend><p className="mt-1 text-xs text-ink-faint">Choose the closest match so people know what to expect.</p><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{EVENT_FORMATS.map((item) => { const active = format === item.value; return <button key={item.value} type="button" aria-pressed={active} onClick={() => onFormat(item.value)} className={`relative min-h-[5.25rem] overflow-hidden rounded-xl border p-3.5 pr-10 text-left transition-all ${active ? "border-green bg-green/[0.08] text-green-text shadow-sm" : "border-sand bg-paper text-ink-muted hover:border-green/40"}`}><span aria-hidden className="pointer-events-none absolute -bottom-4 -right-1 text-6xl font-bold opacity-[0.07]">{item.mark}</span><span className="relative block text-sm font-semibold">{item.label}</span><span className="relative mt-1 block text-xs leading-snug opacity-70">{item.hint}</span>{active && <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-green text-[0.65rem] text-on-green">✓</span>}</button>; })}</div></fieldset>
    <fieldset><legend className="text-sm font-semibold text-ink">Who is it for?</legend><p className="mt-1 text-xs text-ink-faint">Select every audience that is welcome.</p><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{EVENT_AUDIENCES.map((item) => { const active = audience.includes(item.value); return <button key={item.value} type="button" aria-pressed={active} onClick={() => toggleAudience(item.value)} className={`relative min-h-14 overflow-hidden rounded-xl border px-3.5 py-3 pr-9 text-left text-sm font-semibold ${active ? "border-teal bg-teal/[0.09] text-teal-text" : "border-sand bg-paper text-ink-muted"}`}><span aria-hidden className="pointer-events-none absolute -bottom-3 right-1 text-5xl font-bold opacity-[0.07]">{item.mark}</span><span className="relative">{item.label}</span>{active && <span className="absolute right-2.5 top-2.5 text-teal-text">✓</span>}</button>; })}</div></fieldset>
    <div className="grid gap-5 sm:grid-cols-2"><Label title="Start time (optional)"><input name="startTime" type="time" defaultValue={text("startTime")} className={field} /></Label><Label title="End time (optional)"><input name="endTime" type="time" defaultValue={text("endTime")} className={field} /></Label></div>
    <div className="grid gap-5 sm:grid-cols-2"><Label title="Organiser"><input name="organiser" defaultValue={text("organiser")} className={field} placeholder="Organisation or host name" /></Label><Label title="Contact for questions"><input name="contactInfo" defaultValue={text("contactInfo")} className={field} placeholder="Phone, email or WhatsApp" /></Label></div>
    <Label title="Event highlights" hint="One highlight per line — performances, activities, food, prizes or key experiences."><textarea name="highlights" rows={4} defaultValue={lines("highlights")} className={field} placeholder={"Live performances\nFood village\nChildren’s activities"} /></Label>
    <Label title="Featured guests, speakers or performers" hint="One name per line. Add only confirmed guests."><textarea name="featuredGuests" rows={3} defaultValue={lines("featuredGuests")} className={field} placeholder={"Guest name — role or act\nSpeaker name — topic"} /></Label>
    <div className="grid gap-5 sm:grid-cols-2"><Label title="Age guidance"><input name="ageGuidance" defaultValue={text("ageGuidance")} className={field} placeholder="All ages, 18+, children with guardian…" /></Label><Label title="Dress code (optional)"><input name="dressCode" defaultValue={text("dressCode")} className={field} placeholder="Casual, traditional wear, formal…" /></Label></div>
    <Label title="Accessibility and arrival information" hint="Mention accessible entrances, seating, parking, transport, sign support or who to contact for assistance."><textarea name="accessibility" rows={3} defaultValue={text("accessibility")} className={field} /></Label>
    <fieldset className="rounded-2xl border border-gold-border/35 bg-gold/[0.05] p-4 sm:p-5"><legend className="px-1 text-sm font-semibold text-ink">Admission and tickets</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{([{ value: "free", label: "Free entry", hint: "No payment is required", mark: "0" }, { value: "paid", label: "Paid tickets", hint: "Sell through Oguaa with Paystack", mark: "₵" }] as const).map((item) => { const active = admission === item.value; return <button key={item.value} type="button" aria-pressed={active} onClick={() => onAdmission(item.value)} className={`relative min-h-20 overflow-hidden rounded-xl border p-4 text-left ${active ? "border-gold-border bg-gold/[0.12] text-gold-text" : "border-sand bg-paper text-ink-muted"}`}><span aria-hidden className="pointer-events-none absolute -bottom-6 right-2 text-7xl font-bold opacity-[0.08]">{item.mark}</span><span className="relative block text-sm font-semibold">{item.label}</span><span className="relative mt-1 block text-xs opacity-75">{item.hint}</span>{active && <span className="absolute right-3 top-3">✓</span>}</button>; })}</div>
      {admission === "paid" && <div className="mt-5 space-y-3"><div><p className="text-sm font-semibold text-ink">Ticket types</p><p className="mt-1 text-xs text-ink-faint">Create up to eight options. Capacity left empty or zero means unlimited.</p></div>{tiers.map((tier, index) => <div key={`tier-${index}`} className="relative grid gap-3 rounded-xl border border-sand bg-paper p-4 sm:grid-cols-[1.3fr_0.8fr_0.8fr_auto]"><Label title="Ticket name"><input value={tier.name} onChange={(e) => updateTier(index, { name: e.target.value })} className={field} placeholder="General, VIP…" /></Label><Label title="Price (GH₵)"><input value={tier.priceGhs} onChange={(e) => updateTier(index, { priceGhs: e.target.value })} className={field} type="number" min="0.01" step="0.01" /></Label><Label title="Capacity"><input value={tier.capacity} onChange={(e) => updateTier(index, { capacity: e.target.value })} className={field} type="number" min="0" step="1" placeholder="Unlimited" /></Label><button type="button" onClick={() => onTiers(tiers.filter((_, i) => i !== index))} className="self-end rounded-lg border border-clay/30 px-3 py-3 text-xs font-semibold text-clay-text">Remove</button></div>)}<button type="button" disabled={tiers.length >= 8} onClick={() => onTiers([...tiers, { name: "", priceGhs: "", capacity: "" }])} className="rounded-xl border-2 border-dashed border-sand px-4 py-3 text-sm font-semibold text-green-text disabled:opacity-40">+ Add ticket type</button></div>}
    </fieldset>
    <Label title="Refund or cancellation policy" hint="Keep it short and clear. For free events, explain how schedule changes will be announced."><textarea name="refundPolicy" rows={2} defaultValue={text("refundPolicy")} className={field} /></Label>
  </div>;
}
