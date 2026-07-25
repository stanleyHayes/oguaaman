const AMENITIES = [
  { label: "Water", mark: "◒" }, { label: "Water tank", mark: "◓" }, { label: "Wi-Fi", mark: "⌁" }, { label: "Parking", mark: "P" },
  { label: "Air conditioning", mark: "❄" }, { label: "Ceiling fans", mark: "✣" }, { label: "Kitchen", mark: "◫" }, { label: "Private bathroom", mark: "◉" },
  { label: "Hot water", mark: "♨" }, { label: "Prepaid electricity", mark: "ϟ" }, { label: "Gated compound", mark: "▥" }, { label: "Security", mark: "◇" },
  { label: "Backup power", mark: "↯" }, { label: "Laundry", mark: "◎" }, { label: "Courtyard", mark: "□" }, { label: "Veranda", mark: "⌂" },
  { label: "Accessible", mark: "↗" }, { label: "Swimming pool", mark: "≈" }, { label: "Sea view", mark: "≋" }, { label: "Housekeeping", mark: "✦" },
] as const;

export function AmenitiesPicker({ value, onChange }: Readonly<{ value: string[]; onChange: (value: string[]) => void }>) {
  function has(label: string) { return value.some((item) => item.toLowerCase() === label.toLowerCase()); }
  function toggle(label: string) { onChange(has(label) ? value.filter((item) => item.toLowerCase() !== label.toLowerCase()) : [...value, label]); }
  return <fieldset><div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><legend className="text-sm font-semibold text-ink">What does this place include?</legend><p className="mt-1 text-xs leading-relaxed text-ink-faint">Select everything guests or tenants can reliably expect.</p></div><span className="rounded-lg bg-green/[0.08] px-2.5 py-1 text-xs font-semibold text-green-text">{value.length} selected</span></div><div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">{AMENITIES.map((amenity) => {
    const selected = has(amenity.label);
    return <button type="button" key={amenity.label} aria-pressed={selected} onClick={() => toggle(amenity.label)} className={`relative flex min-h-[5.25rem] flex-col items-start justify-between overflow-hidden rounded-xl border p-3 text-left transition-all ${selected ? "border-green bg-green/[0.08] ring-1 ring-green/20" : "border-sand bg-paper hover:-translate-y-0.5 hover:border-green/40"}`}><span aria-hidden className="pointer-events-none absolute -bottom-5 right-1 text-6xl font-bold opacity-[0.055]">{amenity.mark}</span><span className={`relative flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ${selected ? "bg-green text-on-green" : "bg-gold/[0.14] text-gold-text"}`}>{amenity.mark}</span><span className={`relative mt-2 pr-5 text-sm font-semibold leading-snug ${selected ? "text-green-text" : "text-ink"}`}>{amenity.label}</span>{selected && <span className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-green text-[0.65rem] font-bold text-on-green" aria-hidden>✓</span>}</button>;
  })}</div></fieldset>;
}
