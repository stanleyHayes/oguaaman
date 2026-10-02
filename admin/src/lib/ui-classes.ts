// Shared class strings for the news-desk, elections and ads screens. Every
// interactive element gets hover, a pressed state (scale 0.98) and a visible
// focus ring; transitions stay on colour/transform at 200 ms.

const PRESS = "transition-[background-color,border-color,color,transform] duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-cream disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100";

export const btnPrimary = `inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-green px-4 py-2 text-sm font-semibold text-on-green hover:bg-green-900 ${PRESS}`;
export const btnSecondary = `inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-sand bg-paper px-4 py-2 text-sm font-semibold text-ink hover:border-gold-border/70 hover:text-gold-text ${PRESS}`;
export const btnDanger = `inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-maroon-900 px-4 py-2 text-sm font-semibold text-on-green hover:bg-maroon-900/90 ${PRESS}`;
export const btnDangerOutline = `inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-maroon-text/40 px-4 py-2 text-sm font-semibold text-maroon-text hover:bg-maroon-900/[0.06] ${PRESS}`;
export const btnGhost = `inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-ink-muted hover:bg-sand/60 hover:text-ink ${PRESS}`;
export const btnSmall = "!min-h-8 !px-3 !py-1.5 !text-xs";

export const inputCls = "w-full rounded-lg border border-sand bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-faint transition-[border-color,box-shadow] duration-200 hover:border-gold-border/50 focus:border-green-text focus:outline-none focus:ring-2 focus:ring-green/15 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-clay aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-clay/15";
export const labelCls = "mb-1 block text-xs font-medium text-ink-muted";
export const sectionTitleCls = "text-base font-semibold tracking-[-0.01em] text-ink [text-wrap:balance]";
export const tableHeadCls = "border-b border-sand text-left text-[0.65rem] font-bold uppercase tracking-wider text-ink-faint";
export const segmentCls = (on: boolean) =>
  `inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition-[background-color,color,transform] duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 ${on ? "bg-green text-on-green" : "text-ink-muted hover:bg-sand/60 hover:text-ink"}`;
