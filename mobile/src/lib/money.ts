/**
 * Parse a cedi amount typed by a person into integer pesewas, or null when it
 * isn't a clean number. parseFloat would stop at the first comma and turn
 * "1,200" into 1, so grouping is handled explicitly:
 * - spaces and a leading "GH₵"/"₵"/"GHS" are ignored;
 * - "1,200" / "1,200.50" — commas as thousands separators;
 * - "1200,5" / "1200,50" — a comma as the decimal mark (1–2 digits after it);
 * - anything else (letters, two decimal marks, 3+ decimals) is rejected.
 */
export function parseCedisToPesewas(input: string): number | null {
  let v = input.replace(/\s+/g, "").replace(/^(GH₵|GHS|GH¢|₵|¢)/i, "");
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(v)) v = v.replace(/,/g, "");
  else if (/^\d+,\d{1,2}$/.test(v)) v = v.replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
  const [whole, frac = ""] = v.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}
