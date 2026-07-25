import { ImageUpload } from "@/components/image-upload";
import type { ArtistRelease, SocialLink } from "@/lib/types";
import { PlatformCombobox } from "@/components/platform-combobox";

const input = "w-full rounded-xl border border-sand bg-paper px-4 py-3 text-ink transition-colors placeholder:text-ink-faint focus:border-green focus:bg-cream focus:outline-none focus:ring-2 focus:ring-green/15";
const RELEASE_TYPES: NonNullable<ArtistRelease["kind"]>[] = ["album", "ep", "single", "mixtape", "live", "compilation"];

export function ArtistSubmissionFields({
  streamingLinks, onStreamingLinks, socials, onSocials, booking, onBooking, releases, onReleases,
}: Readonly<{
  streamingLinks: SocialLink[];
  onStreamingLinks: (links: SocialLink[]) => void;
  socials: SocialLink[];
  onSocials: (links: SocialLink[]) => void;
  booking: string;
  onBooking: (booking: string) => void;
  releases: ArtistRelease[];
  onReleases: (releases: ArtistRelease[]) => void;
}>) {
  function updateRelease(index: number, patch: Partial<ArtistRelease>) {
    onReleases(releases.map((release, i) => i === index ? { ...release, ...patch } : release));
  }

  return (
    <div className="space-y-7 border-t border-sand pt-7">
      <section>
        <p className="eyebrow text-gold-text">Listen elsewhere</p>
        <h3 className="mt-1 text-xl font-semibold text-ink">Streaming platforms</h3>
        <p className="mt-1 text-sm text-ink-muted">Add every service where fans can find you. There is no platform limit.</p>
        <div className="mt-4 space-y-3">
          {streamingLinks.map((link, index) => (
            <div key={`stream-${index}`} className="grid gap-2 sm:grid-cols-[15rem_minmax(0,1fr)_auto]">
              <PlatformCombobox value={link.label} onChange={(label) => onStreamingLinks(streamingLinks.map((item, i) => i === index ? { ...item, label } : item))} label={`Platform ${index + 1}`} />
              <input type="url" value={link.url} onChange={(event) => onStreamingLinks(streamingLinks.map((item, i) => i === index ? { ...item, url: event.target.value } : item))} className={input} placeholder="https://…" aria-label={`Platform ${index + 1} URL`} />
              <button type="button" onClick={() => onStreamingLinks(streamingLinks.filter((_, i) => i !== index))} className="min-h-11 rounded-lg border border-maroon-text/25 px-3 text-xs font-semibold text-maroon-text hover:bg-maroon-900/[0.06]">Remove</button>
            </div>
          ))}
          <button type="button" onClick={() => onStreamingLinks([...streamingLinks, { label: "Spotify", url: "" }])} className="min-h-11 rounded-full border border-green/30 px-4 text-sm font-semibold text-green-text">+ Add streaming platform</button>
        </div>
      </section>

      <section>
        <p className="eyebrow text-teal-text">Find the artist</p>
        <h3 className="mt-1 text-xl font-semibold text-ink">Social media pages</h3>
        <p className="mt-1 text-sm text-ink-muted">Choose the platform, then paste the artist&apos;s official page. No platform names to type.</p>
        <div className="mt-4 space-y-3">
          {socials.map((link, index) => (
            <div key={`social-${index}`} className="grid gap-2 sm:grid-cols-[15rem_minmax(0,1fr)_auto]">
              <PlatformCombobox kind="social" value={link.label} onChange={(label) => onSocials(socials.map((item, i) => i === index ? { ...item, label } : item))} label={`Social platform ${index + 1}`} />
              <input type="url" value={link.url} onChange={(event) => onSocials(socials.map((item, i) => i === index ? { ...item, url: event.target.value } : item))} className={input} placeholder="https://…" aria-label={`Social platform ${index + 1} URL`} />
              <button type="button" onClick={() => onSocials(socials.filter((_, i) => i !== index))} className="min-h-11 rounded-lg border border-maroon-text/25 px-3 text-xs font-semibold text-maroon-text hover:bg-maroon-900/[0.06]">Remove</button>
            </div>
          ))}
          <button type="button" onClick={() => onSocials([...socials, { label: "Instagram", url: "" }])} className="min-h-11 rounded-full border border-green/30 px-4 text-sm font-semibold text-green-text">+ Add social platform</button>
        </div>
      </section>

      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-ink">External management page (optional)</span>
        <input type="url" value={booking} onChange={(event) => onBooking(event.target.value)} className={input} placeholder="https://booking.example.com/artist" />
        <span className="mt-1.5 block text-xs text-ink-faint">Optional. Oguaa booking requests still arrive in your private creator dashboard.</span>
      </label>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="eyebrow text-teal-text">Discography</p><h3 className="mt-1 text-xl font-semibold text-ink">Albums, EPs and songs</h3><p className="mt-1 text-sm text-ink-muted">Oguaa lists the catalogue and track titles; listening stays on your streaming services.</p></div>
          <button type="button" onClick={() => onReleases([...releases, { id: `release-${Date.now()}`, title: "", kind: "single", tracks: [] }])} className="min-h-11 rounded-full bg-green px-4 text-sm font-semibold text-on-green">Add a release</button>
        </div>
        {releases.length === 0 ? <p className="mt-4 rounded-xl border border-dashed border-sand bg-paper p-5 text-sm text-ink-muted">No releases added yet. Add an album, EP or single to build the artist catalogue.</p> : (
          <div className="mt-5 space-y-5">
            {releases.map((release, index) => (
              <article key={release.id ?? index} className="rounded-[var(--radius-card)] border border-sand bg-paper p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3"><strong className="text-sm text-ink">Release {String(index + 1).padStart(2, "0")}</strong><button type="button" onClick={() => onReleases(releases.filter((_, i) => i !== index))} className="text-xs font-semibold text-maroon-text">Remove</button></div>
                <div className="mt-4 grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)]">
                  <ImageUpload value={release.coverImageUrl ?? ""} onChange={(coverImageUrl) => updateRelease(index, { coverImageUrl })} label="Release artwork" hint="Square artwork works best." />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-medium text-ink">Release title</span><input value={release.title} onChange={(event) => updateRelease(index, { title: event.target.value })} className={input} required /></label>
                    <label><span className="mb-1.5 block text-sm font-medium text-ink">Type</span><select value={release.kind ?? "single"} onChange={(event) => updateRelease(index, { kind: event.target.value as ArtistRelease["kind"] })} className={input}>{RELEASE_TYPES.map((kind) => <option key={kind} value={kind}>{kind === "ep" ? "EP" : kind[0].toUpperCase() + kind.slice(1)}</option>)}</select></label>
                    <label><span className="mb-1.5 block text-sm font-medium text-ink">Year</span><input type="number" min="1900" max="2100" value={release.year ?? ""} onChange={(event) => updateRelease(index, { year: event.target.value ? Number(event.target.value) : undefined })} className={input} /></label>
                    <label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-medium text-ink">About this release</span><textarea rows={2} value={release.description ?? ""} onChange={(event) => updateRelease(index, { description: event.target.value })} className={input} /></label>
                    <label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-medium text-ink">Tracklist</span><textarea rows={4} value={(release.tracks ?? []).map((track) => track.title).join("\n")} onChange={(event) => updateRelease(index, { tracks: event.target.value.split("\n").map((title) => ({ title: title.trim() })).filter((track) => track.title) })} className={input} placeholder={"One track per line\nTrack one\nTrack two"} /></label>
                    <label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-medium text-ink">Primary release link</span><input type="url" value={release.url ?? ""} onChange={(event) => updateRelease(index, { url: event.target.value })} className={input} placeholder="https://…" /></label>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
