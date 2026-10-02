const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(iso?: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

export function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Masks an ID or account number, keeping the first and last four characters
 *  and any separators, e.g. "GHA-•••••••12-3". */
export function maskIdentifier(value: string | undefined): string {
  if (!value) return "—";
  const keep = 4;
  if (value.length <= keep * 2) return `${"•".repeat(Math.max(0, value.length - keep))}${value.slice(-keep)}`;
  const middle = value.slice(keep, -keep).replaceAll(/[^-\s]/g, "•");
  return `${value.slice(0, keep)}${middle}${value.slice(-keep)}`;
}

const NUMBER = new Intl.NumberFormat("en-GH");

/** Integer pesewas as "GH₵ 1,234.50" (two decimals only when needed). */
export function cedis(pesewas?: number): string {
  const v = (pesewas ?? 0) / 100;
  return `GH₵ ${v.toLocaleString("en-GH", { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** Micro-USD as "$1.83" (always two decimals). */
export function usd(microUsd?: number): string {
  return `$${((microUsd ?? 0) / 1_000_000).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** A count with thousands separators: 12,480. */
export function count(n?: number): string {
  return NUMBER.format(n ?? 0);
}

/** A 0..1 ratio as a percentage: 0.4231 → "42.3%". */
export function percent(ratio?: number, digits = 1): string {
  const v = (ratio ?? 0) * 100;
  return `${v.toFixed(Number.isInteger(v) ? 0 : digits)}%`;
}

/** RFC3339 timestamp as "2 Oct 2026, 14:05" in Accra time (UTC+0). */
export function formatDateTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:${mm}`;
}

/** Today's date in Accra (UTC+0) as YYYY-MM-DD. */
export function todayAccra(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Adds whole days to a YYYY-MM-DD date. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "pending_review" → "Pending review". */
export function humanize(code: string): string {
  const s = code.replaceAll(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
