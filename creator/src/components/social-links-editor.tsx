import { PlatformCombobox } from "@/components/platform-combobox";
import type { SocialLink } from "@/lib/types";

const input = "min-h-11 w-full rounded-lg border border-sand bg-paper px-3.5 py-2.5 text-ink placeholder:text-ink-faint focus:border-green focus:outline-none focus:ring-2 focus:ring-green/15";

export function SocialLinksEditor({ links, onChange, title = "Social media and website" }: Readonly<{ links: SocialLink[]; onChange: (links: SocialLink[]) => void; title?: string }>) {
  return <section className="rounded-2xl border border-sand bg-cream p-4 sm:p-5">
    <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-text">Official pages</p>
    <h2 className="mt-1 text-xl font-semibold text-ink">{title}</h2>
    <p className="mt-1 text-sm text-ink-muted">Choose each platform and paste the official page. No platform names to type.</p>
    <div className="mt-4 space-y-3">
      {links.map((link, index) => <div key={`social-${index}`} className="grid gap-2 sm:grid-cols-[15rem_minmax(0,1fr)_auto]">
        <PlatformCombobox kind="social" value={link.label} onChange={(label) => onChange(links.map((item, i) => i === index ? { ...item, label } : item))} label={`Social platform ${index + 1}`} />
        <input type="url" className={input} value={link.url} onChange={(event) => onChange(links.map((item, i) => i === index ? { ...item, url: event.target.value } : item))} placeholder="https://…" aria-label={`Social platform ${index + 1} URL`} />
        <button type="button" onClick={() => onChange(links.filter((_, i) => i !== index))} className="min-h-11 rounded-lg border border-maroon-text/25 px-3 text-xs font-semibold text-maroon-text">Remove</button>
      </div>)}
      <button type="button" onClick={() => onChange([...links, { label: "Website", url: "" }])} className="min-h-11 rounded-full border border-green/30 px-4 text-sm font-semibold text-green-text">+ Add social platform</button>
    </div>
  </section>;
}
