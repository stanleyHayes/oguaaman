const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function dayMonth(iso: string): { day: string; mon: string } {
  const [, m, d] = iso.slice(0, 10).split("-").map(Number);
  return { day: String(d).padStart(2, "0"), mon: MONTHS[m - 1].toUpperCase() };
}

export function formatDayMonth(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS_LONG[m - 1]}`;
}

export function yearOf(iso?: string): string {
  return iso ? iso.slice(0, 4) : "";
}

export function lifeDates(bornYear?: number, diedDate?: string): string {
  const born = bornYear ? String(bornYear) : "";
  const died = diedDate ? yearOf(diedDate) : "";
  return [born, died].filter(Boolean).join(" — ");
}

export function tagLabel(tag: string): string {
  const raw = tag.includes(":") ? tag.split(":")[1] : tag;
  return raw.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}
