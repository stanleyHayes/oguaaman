const BUSINESS_CATEGORIES = [
  "Food & Drink",
  "Hospitality & Lodging",
  "Retail & Shopping",
  "Market & Fishing",
  "Fashion & Tailoring",
  "Beauty & Wellness",
  "Craft & Textiles",
  "Arts & Entertainment",
  "Professional Services",
  "Home & Construction",
  "Transport & Logistics",
  "Technology & Media",
  "Education & Training",
  "Health & Pharmacy",
  "Finance & Insurance",
  "Agriculture",
  "Books & Stationery",
  "Community Organisation",
] as const;
const MARKS = ["♨", "⌂", "▣", "≈", "✂", "✦", "◇", "♫", "§", "⌘", "➜", "◫", "⌑", "+", "₵", "♧", "▤", "◎"] as const;

export function BusinessCategoryPicker({ value, onChange }: Readonly<{ value: string[]; onChange: (value: string[]) => void }>) {
  function toggle(category: string) {
    onChange(value.includes(category) ? value.filter((item) => item !== category) : [...value, category]);
  }

  return (
    <fieldset>
      <legend className="text-sm font-semibold text-ink">Business categories</legend>
      <p className="mt-1 text-xs leading-relaxed text-ink-faint">Choose every category that describes the business. The first selection becomes its main category.</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="Business categories">
        {BUSINESS_CATEGORIES.map((category, index) => {
          const selected = value.includes(category);
          return (
            <button
              key={category}
              type="button"
              aria-pressed={selected}
              onClick={() => toggle(category)}
              className={`relative min-h-14 overflow-hidden rounded-xl border px-3.5 py-3 pr-10 text-left text-sm font-semibold transition-all ${selected ? "border-green bg-green/[0.08] text-green-text shadow-sm" : "border-sand bg-paper text-ink-muted hover:border-green/40 hover:text-ink"}`}
            >
              <span aria-hidden className="pointer-events-none absolute -bottom-4 right-1 text-5xl font-bold opacity-[0.06]">{MARKS[index]}</span><span className="relative">{category}</span>
              <span className={`absolute right-3 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md border text-[0.65rem] transition-colors ${selected ? "border-green bg-green text-on-green" : "border-sand text-transparent"}`} aria-hidden>✓</span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs font-medium text-green-text">{value.length ? `${value.length} selected · ${value[0]} is primary` : "Select at least one category"}</p>
    </fieldset>
  );
}
