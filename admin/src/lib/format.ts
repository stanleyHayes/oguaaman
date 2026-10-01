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
