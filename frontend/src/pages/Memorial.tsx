import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router-dom";
import type { Listing, Place, Organization } from "@/lib/types";
import { api } from "@/lib/api";
import { Adinkra, SymbolDivider } from "@/components/adinkra";
import { CandleRemember, Tributes } from "@/components/memorial-actions";
import { ReportButton } from "@/components/report-button";
import { lifeDates, formatDayMonth, initials } from "@/lib/format";

interface Data {
  memorial: Listing;
  places: Place[];
  schools: Organization[];
}

export async function loader({ params }: LoaderFunctionArgs): Promise<Data> {
  const [memorial, places, schools] = await Promise.all([
    api.memorial(params.slug!),
    api.places().catch(() => []),
    api.schools().catch(() => []),
  ]);
  return { memorial, places, schools };
}

const GALLERY_GRADIENTS = [
  "linear-gradient(135deg,#D9C8A6,#C2A878)", "linear-gradient(135deg,#C7D0C2,#9DAE96)",
  "linear-gradient(135deg,#E0CDBE,#C7A98E)", "linear-gradient(135deg,#CFC2AC,#AE9E80)",
  "linear-gradient(135deg,#D3CBBE,#B0A48F)", "linear-gradient(135deg,#D8C6A2,#BBA06F)",
];

export function Component() {
  const { memorial: m, places, schools } = useLoaderData() as Data;
  const d = m.details;
  const place = places.find((p) => p.id === m.townId) ?? null;
  const memSchools = (m.schoolIds ?? []).map((id) => schools.find((s) => s.id === id)).filter(Boolean) as Organization[];
  const story = (d.lifeStory ?? "").split("\n\n");

  const shown = new Set<string>([place?.name, ...memSchools.map((s) => s.name)].filter(Boolean) as string[]);
  const extraAssociations = (d.associations ?? []).filter((a) => !shown.has(a));

  const remembrance = d.remindersEnabled
    ? `Remembered each year on ${formatDayMonth(d.diedDate!)}${d.observeBirthday && d.birthday ? ` and the birthday, ${formatDayMonth(d.birthday)}` : ""} — the dates the family chose.`
    : null;

  return (
    <article className="bg-cream">
      <p className="border-b border-sand py-6 text-center text-xs font-medium uppercase tracking-[0.38em] text-ink-faint">
        Yɛn<span className="tracking-[0.34em] text-gold-text">kae</span> · In Memoriam
      </p>

      <div className="mx-auto max-w-[44rem] px-4 pb-24 sm:px-6">
        <header className="pt-12 text-center">
          <span className="relative mx-auto flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border border-gold-border/40 font-display text-5xl text-green" style={{ background: "radial-gradient(circle at 50% 38%, #F0E4CC, #E2D2AE)" }} aria-hidden>
            {initials(m.title)}
            {m.coverImageUrl && <img src={m.coverImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />}
          </span>
          <h1 className="mt-7 font-display text-5xl font-medium leading-none text-ink sm:text-6xl">{d.honorific ? `${d.honorific} ` : ""}{m.title}</h1>
          {place && <p className="mt-3 font-serif text-lg italic text-ink-muted">{place.name}</p>}
          <p className="mt-5 text-sm font-medium uppercase tracking-[0.18em] text-gold-text">{lifeDates(d.bornYear, d.diedDate)}</p>
          {d.epitaph && <p className="mx-auto mt-5 max-w-[30ch] font-display text-2xl font-medium italic leading-snug text-ink">“{d.epitaph}”</p>}

          <div className="mt-7 flex flex-wrap justify-center gap-2">
            {place && <span className="rounded-full border border-sand bg-paper px-3 py-1.5 text-xs text-green">{place.name}</span>}
            {memSchools.map((s) => (
              <Link key={s.id} to={`/education/${s.slug}`} className="rounded-full border border-sand bg-paper px-3 py-1.5 text-xs text-green hover:border-gold-brand hover:text-gold-text">{s.name}</Link>
            ))}
            {extraAssociations.map((a) => <span key={a} className="rounded-full border border-sand bg-paper px-3 py-1.5 text-xs text-green">{a}</span>)}
          </div>

          <CandleRemember slug={m.slug} initialCandles={d.candles ?? 0} initialRemembered={d.rememberedByCount ?? 0} />
          {remembrance && <p className="mt-4 text-sm italic text-ink-muted">{remembrance}</p>}
        </header>

        <SymbolDivider name="owuo-atwedee" className="my-14" />

        <section>
          <p className="mb-4 text-center text-xs uppercase tracking-[0.32em] text-ink-faint">Celebration of a life</p>
          <div className="font-serif text-lg leading-relaxed text-ink">
            {story.map((p, i) => (
              <p key={i} className={i === 0 ? "[&::first-letter]:float-left [&::first-letter]:mr-3 [&::first-letter]:font-display [&::first-letter]:text-6xl [&::first-letter]:leading-[0.8] [&::first-letter]:text-gold-brand" : "mt-5"}>{p}</p>
            ))}
          </div>
        </section>

        {d.gallery && d.gallery.length > 0 && (
          <>
            <SymbolDivider name="nyame-nwu-na-mawu" className="my-14" />
            <section>
              <p className="mb-5 text-center text-xs uppercase tracking-[0.32em] text-ink-faint">Moments</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {d.gallery.map((g, i) => (
                  <div key={i} className="relative aspect-square overflow-hidden rounded border border-sand" style={{ background: GALLERY_GRADIENTS[i % GALLERY_GRADIENTS.length] }}>
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-2.5 pb-1.5 pt-4 text-xs text-cream">{g.caption}</span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        <SymbolDivider name="nyame-nwu-na-mawu" className="my-14" />

        <section>
          <p className="mb-5 text-center text-xs uppercase tracking-[0.32em] text-ink-faint">Tributes</p>
          <Tributes slug={m.slug} initial={m.tributes ?? []} />
        </section>

        <div className="mt-16 text-center">
          <Adinkra name="nyame-nwu-na-mawu" size={26} className="mx-auto text-gold-brand" />
          <p className="mt-3 font-display text-2xl text-gold-text">Yɛnkae</p>
          <p className="mt-1 text-xs uppercase tracking-[0.26em] text-ink-faint">Kept in remembrance</p>
          <Link to="/memoriam" className="mt-6 inline-block text-sm text-ink-muted hover:text-gold-text">← All who we remember</Link>
          <div className="mt-8 border-t border-sand pt-5">
            <ReportButton listingId={m.id} memorial />
            <p className="mt-1.5 text-xs text-ink-faint">Is something here wrong, or does the family wish to make a change? Let a steward know.</p>
          </div>
        </div>
      </div>
    </article>
  );
}
