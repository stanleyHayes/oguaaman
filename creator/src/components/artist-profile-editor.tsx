import { ImageUpload } from "@/components/image-upload";
import { newArtistRelease } from "@/lib/artist-profile";
import type { ArtistRelease, SocialLink } from "@/lib/types";
import { PlatformCombobox } from "@/components/platform-combobox";

const input = "min-h-11 w-full rounded-lg border border-sand bg-paper px-3.5 py-2.5 text-ink placeholder:text-ink-faint focus:border-green focus:outline-none focus:ring-2 focus:ring-green/15";

export function ArtistProfileEditor({
  streamingLinks,
  onStreamingLinks,
  socials,
  onSocials,
  booking,
  onBooking,
  releases,
  onReleases,
}: Readonly<{
  streamingLinks: SocialLink[];
  onStreamingLinks: (links: SocialLink[]) => void;
  socials: SocialLink[];
  onSocials: (links: SocialLink[]) => void;
  booking: string;
  onBooking: (value: string) => void;
  releases: ArtistRelease[];
  onReleases: (releases: ArtistRelease[]) => void;
}>) {
  function updateRelease(index: number, patch: Partial<ArtistRelease>) {
    onReleases(releases.map((release, i) => i === index ? { ...release, ...patch } : release));
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-gold-border/35 bg-gold/[0.05] p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold-text">Listening destinations</p>
            <h2 className="mt-1 text-xl font-semibold text-ink">Add every platform you use</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">There is no platform cap. Search the supported services and add every destination where listeners can find you.</p>
          </div>
          <span className="rounded-full bg-green px-3 py-1 text-xs font-bold text-on-green">{streamingLinks.filter((link) => link.label.trim() && link.url.trim()).length} listed</span>
        </div>

        <LinkRows links={streamingLinks} onChange={onStreamingLinks} platformKind="streaming" addLabel="Add another platform" />
      </section>

      <section className="rounded-2xl border border-sand bg-cream p-4 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-clay-text">Contact and community</p>
        <h2 className="mt-1 text-xl font-semibold text-ink">Social and management links</h2>
        <div className="mt-5 space-y-5">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">External management page (optional)</span>
            <input type="url" value={booking} onChange={(event) => onBooking(event.target.value)} className={input} placeholder="https://… or mailto:management@example.com" />
          </label>
          <LinkRows links={socials} onChange={onSocials} platformKind="social" addLabel="Add a social platform" />
        </div>
      </section>

      <section className="rounded-2xl border border-sand bg-cream p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-text">Discography</p>
            <h2 className="mt-1 text-xl font-semibold text-ink">Albums, EPs and songs</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">Build a real catalogue even though Oguaa does not host audio. Add artwork, release details and the tracklist fans should discover.</p>
          </div>
          <button type="button" onClick={() => onReleases([...releases, newArtistRelease()])} className="min-h-11 rounded-full bg-green px-4 text-sm font-semibold text-on-green hover:bg-green-900">Add a release</button>
        </div>

        {releases.length === 0 ? (
          <button type="button" onClick={() => onReleases([newArtistRelease()])} className="mt-5 w-full rounded-xl border-2 border-dashed border-sand bg-paper px-5 py-8 text-center text-sm font-semibold text-green-text hover:border-green/35">Add the first album, EP or single</button>
        ) : (
          <div className="mt-6 space-y-5">
            {releases.map((release, index) => (
              <article key={release.id ?? `${release.title}-${index}`} className="rounded-xl border border-sand bg-paper p-4 sm:p-5">
                <div className="flex items-center justify-between gap-4 border-b border-sand pb-4">
                  <div><span className="text-xs font-bold text-gold-text">{String(index + 1).padStart(2, "0")}</span><h3 className="mt-1 font-semibold text-ink">{release.title || "Untitled release"}</h3></div>
                  <button type="button" onClick={() => onReleases(releases.filter((_, i) => i !== index))} className="rounded-full border border-maroon-text/25 px-3 py-1.5 text-xs font-semibold text-maroon-text hover:bg-maroon-900/[0.06]">Remove</button>
                </div>
                <div className="mt-5 grid gap-5 lg:grid-cols-[14rem_minmax(0,1fr)]">
                  <ImageUpload value={release.coverImageUrl ?? ""} onChange={(coverImageUrl) => updateRelease(index, { coverImageUrl })} label="Release artwork" hint="Square artwork works best." />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block sm:col-span-2"><span className="mb-1.5 block text-sm font-medium text-ink">Release title</span><input value={release.title} onChange={(event) => updateRelease(index, { title: event.target.value })} className={input} /></label>
                    <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink">Type</span><select value={release.kind ?? "single"} onChange={(event) => updateRelease(index, { kind: event.target.value as ArtistRelease["kind"] })} className={input}><option value="album">Album</option><option value="ep">EP</option><option value="single">Single</option><option value="mixtape">Mixtape</option><option value="live">Live release</option><option value="compilation">Compilation</option></select></label>
                    <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink">Year</span><input type="number" min="1900" max="2100" value={release.year ?? ""} onChange={(event) => updateRelease(index, { year: event.target.value ? Number(event.target.value) : undefined })} className={input} /></label>
                    <label className="block sm:col-span-2"><span className="mb-1.5 block text-sm font-medium text-ink">About this release</span><textarea rows={2} value={release.description ?? ""} onChange={(event) => updateRelease(index, { description: event.target.value })} className={input} placeholder="The story, collaborators or sound behind it." /></label>
                    <label className="block sm:col-span-2"><span className="mb-1.5 block text-sm font-medium text-ink">Tracklist</span><textarea rows={5} value={(release.tracks ?? []).map((track) => track.title).join("\n")} onChange={(event) => updateRelease(index, { tracks: event.target.value.split("\n").map((title) => ({ title: title.trim() })).filter((track) => track.title) })} className={input} placeholder={"One track per line\nTrack one\nTrack two"} /><span className="mt-1 block text-xs text-ink-faint">One title per line. Singles can have one track.</span></label>
                    <label className="block sm:col-span-2"><span className="mb-1.5 block text-sm font-medium text-ink">Primary release link (optional)</span><input type="url" value={release.url ?? ""} onChange={(event) => updateRelease(index, { url: event.target.value })} className={input} placeholder="https://…" /></label>
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

function PlatformSelect({ value, onChange, index, kind }: Readonly<{ value: string; onChange: (value: string) => void; index: number; kind: "streaming" | "social" }>) {
  return <PlatformCombobox value={value} onChange={onChange} label={`Link ${index + 1} platform`} kind={kind} />;
}

function LinkRows({ links, onChange, addLabel, platformKind }: Readonly<{ links: SocialLink[]; onChange: (links: SocialLink[]) => void; addLabel: string; platformKind: "streaming" | "social" }>) {
  function update(index: number, patch: Partial<SocialLink>) {
    onChange(links.map((link, i) => i === index ? { ...link, ...patch } : link));
  }
  return (
    <div className="mt-5 space-y-3">
      {links.map((link, index) => (
        <div key={`link-${index}`} className="grid gap-2 rounded-xl border border-sand bg-paper p-3 sm:grid-cols-[15rem_minmax(0,1fr)_auto] sm:items-center">
          <PlatformSelect value={link.label} onChange={(label) => update(index, { label })} index={index} kind={platformKind} />
          <input type="url" value={link.url} onChange={(event) => update(index, { url: event.target.value })} className={input} placeholder="https://…" aria-label={`Link ${index + 1} URL`} />
          <button type="button" onClick={() => onChange(links.filter((_, i) => i !== index))} className="min-h-11 rounded-lg border border-maroon-text/25 px-3 text-xs font-semibold text-maroon-text hover:bg-maroon-900/[0.06]">Remove</button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...links, { label: platformKind === "streaming" ? "Spotify" : "Instagram", url: "" }])} className="min-h-11 rounded-full border border-green/30 px-4 text-sm font-semibold text-green-text hover:bg-green/[0.05]">+ {addLabel}</button>
    </div>
  );
}
