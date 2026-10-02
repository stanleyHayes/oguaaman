// Class recipes shared by the advertiser flow (kept out of component files for Fast Refresh).

export function inputClass(invalid = false): string {
  return `w-full rounded-lg border bg-paper px-3.5 py-2.5 text-ink placeholder:text-ink-faint transition-[border-color,box-shadow] duration-200 focus:outline-none focus:ring-2 ${
    invalid ? "border-clay/70 focus:border-clay focus:ring-clay/15" : "border-sand focus:border-green focus:ring-green/15"
  }`;
}

/** Primary and quiet buttons used across the advertiser flow. */
export function buttonClass(variant: "primary" | "gold" | "quiet" | "danger" = "primary"): string {
  const base = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition-[background-color,border-color,color,transform] duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-55";
  const tones = {
    primary: "bg-green text-on-green hover:bg-green-900",
    gold: "bg-gold-brand text-green-900 hover:bg-gold",
    quiet: "border border-sand bg-paper text-ink hover:border-green/40",
    danger: "border border-clay/40 bg-paper text-clay-text hover:bg-clay/[0.07]",
  } as const;
  return `${base} ${tones[variant]}`;
}
