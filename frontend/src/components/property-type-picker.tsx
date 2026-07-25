import type { PropertyType } from "@/lib/types";

const TYPES: { value: PropertyType; label: string; description: string; icon: "door" | "building" | "home" | "guest" | "hostel" }[] = [
  { value: "room", label: "Room", description: "A private or shared room", icon: "door" },
  { value: "apartment", label: "Apartment", description: "A self-contained flat", icon: "building" },
  { value: "house", label: "House", description: "An entire standalone home", icon: "home" },
  { value: "guesthouse", label: "Guesthouse", description: "A managed short-stay property", icon: "guest" },
  { value: "hostel", label: "Hostel", description: "Student or shared lodging", icon: "hostel" },
];

export function PropertyTypePicker({ value, onChange }: Readonly<{ value: PropertyType; onChange: (value: PropertyType) => void }>) {
  return <fieldset><legend className="mb-2 text-sm font-semibold text-ink">What kind of place is it?</legend><p className="mb-3 text-xs leading-relaxed text-ink-faint">Choose the closest match so people understand the space before opening the listing.</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{TYPES.map((option) => {
    const selected = option.value === value;
    return <button type="button" key={option.value} aria-pressed={selected} onClick={() => onChange(option.value)} className={`group relative min-h-[7.25rem] overflow-hidden rounded-xl border p-4 text-left transition-all ${selected ? "border-green bg-green/[0.08] shadow-[0_10px_30px_rgba(18,63,45,0.1)] ring-1 ring-green/20" : "border-sand bg-paper hover:-translate-y-0.5 hover:border-green/40 hover:shadow-[var(--shadow-card)]"}`}><span aria-hidden className="pointer-events-none absolute -bottom-4 -right-4 text-green opacity-[0.055] [&>svg]:h-24 [&>svg]:w-24"><PropertyIcon kind={option.icon} /></span><span className={`relative flex h-10 w-10 items-center justify-center rounded-xl ${selected ? "bg-green text-on-green" : "bg-gold/[0.14] text-gold-text"}`}><PropertyIcon kind={option.icon} /></span><span className={`relative mt-3 block text-base font-semibold ${selected ? "text-green-text" : "text-ink"}`}>{option.label}</span><span className="relative mt-1 block pr-7 text-xs leading-relaxed text-ink-faint">{option.description}</span>{selected && <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-green text-xs font-bold text-on-green" aria-hidden>✓</span>}</button>;
  })}</div></fieldset>;
}

function PropertyIcon({ kind }: Readonly<{ kind: "door" | "building" | "home" | "guest" | "hostel" }>) {
  if (kind === "door") return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M3 21h18"/><circle cx="14.5" cy="12" r=".8" fill="currentColor"/></svg>;
  if (kind === "home") return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7"/></svg>;
  if (kind === "guest") return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M4 21V6h16v15M3 21h18M8 10h3v3H8zM14 10h3v3h-3zM9 21v-4h6v4"/><path d="m9 3 3-2 3 2"/></svg>;
  if (kind === "hostel") return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M4 21V5h16v16M3 21h18M8 9h2M14 9h2M8 13h2M14 13h2M10 21v-4h4v4"/></svg>;
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M5 21V4h14v17M3 21h18M9 8h2M14 8h2M9 12h2M14 12h2M10 21v-5h4v5"/></svg>;
}
