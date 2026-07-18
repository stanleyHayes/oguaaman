import { Adinkra, type AdinkraName } from "@/components/adinkra";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { Section, SectionHeading } from "@/components/ui";
import { mediaUrl } from "@/lib/media";

interface Strand {
  symbol: AdinkraName;
  title: string;
  body: string;
}

const STRANDS = [
  {
    symbol: "adinkrahene",
    title: "Fetu Afahye",
    body: "On the first Saturday of September, Oguaa erupts into its great festival. After a season's ban on drumming, the town purifies its 77 gods, the Asafo companies parade, and the chiefs sit in a grand durbar at Victoria Park. It binds the living, the departed and the gods.",
  },
  {
    symbol: "funtunfunefu",
    title: "The seven Asafo companies",
    body: "Bentsir, Anaafo, Ntsin, Nkum, Amanful, Brofomba and Akrampa — the people's companies, each with its colours, its posuban shrine and its songs. They are Oguaa's citizen guard and its keepers of custom.",
  },
  {
    symbol: "nyame-nwu-na-mawu",
    title: "The 77 gods & the durbar",
    body: "Oguaa keeps an unusually rich pantheon of deities and a deep tradition of libation, drumming and Adamfo. The durbar of chiefs — palanquins, linguist staffs, fontomfrom drums — is among the most photographed sights in Ghana.",
  },
  {
    symbol: "sankofa",
    title: "The sound & the table",
    body: "Highlife and gospel born in the chapel choirs; brass bands and the osode pulse. And the food: Fante kenkey and fresh fish from the Bakaano shore, fante-fante (palm-soup) and koobi — the taste of the coast.",
  },
] as const satisfies readonly Strand[];

const COMPANIES = ["Bentsir", "Anaafo", "Ntsin", "Nkum", "Amanful", "Brofomba", "Akrampa"] as const;

function ChapterMark({
  number,
  symbol,
  dark = false,
}: Readonly<{ number: string; symbol: AdinkraName; dark?: boolean }>) {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <span
        className={`grid size-11 place-items-center rounded-full border ${
          dark ? "border-gold/35 bg-cream/[0.07] text-gold" : "border-gold-border/30 bg-gold/[0.1] text-gold-text"
        }`}
      >
        <Adinkra name={symbol} size={24} labelled={false} strokeWidth={1.4} />
      </span>
      <span className={`text-xs font-semibold tracking-[0.22em] ${dark ? "text-gold" : "text-ink-faint"}`}>
        CHAPTER {number}
      </span>
    </div>
  );
}

function CulturePhoto({
  src,
  alt,
  caption,
  className = "aspect-[3/2]",
  imageClassName = "",
  dark = false,
}: Readonly<{
  src: string;
  alt: string;
  caption: string;
  className?: string;
  imageClassName?: string;
  dark?: boolean;
}>) {
  return (
    <figure className="min-w-0">
      <div className={`overflow-hidden rounded-[1.5rem] bg-sand shadow-[var(--shadow-lift)] ${className}`}>
        <img
          src={mediaUrl(src)}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={`h-full w-full object-cover ${imageClassName}`}
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      </div>
      <figcaption
        className={`mt-3 text-xs font-medium leading-relaxed ${dark ? "text-cream/70" : "text-ink-faint"}`}
      >
        {caption}
      </figcaption>
    </figure>
  );
}

function ChapterLink({ href, children, dark = false }: Readonly<{ href: string; children: string; dark?: boolean }>) {
  return (
    <a
      href={href}
      className={`group mt-7 inline-flex min-h-11 items-center gap-2 rounded-full border px-5 text-sm font-semibold transition-colors focus-visible:outline-offset-4 ${
        dark
          ? "border-gold/45 text-gold hover:bg-gold hover:text-green-900"
          : "border-green/25 text-green hover:border-green hover:bg-green hover:text-cream"
      }`}
    >
      {children}
      <span className="transition-transform group-hover:translate-x-1" aria-hidden="true">→</span>
    </a>
  );
}

export function CultureContent() {
  const fetu = STRANDS[0];
  const asafo = STRANDS[1];
  const durbar = STRANDS[2];
  const soundAndTable = STRANDS[3];

  return (
    <Section tone="paper" size="wide" className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_80%_10%,rgba(199,162,74,0.13),transparent_42%)]" aria-hidden="true" />

      <div className="relative">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
          <SectionHeading
            kicker="THE LIVING CULTURE"
            title="A town that still keeps its rites."
            lede="Cape Coast is not a museum — its festival, its companies and its sound are alive, carried each year by the people of Oguaa."
          />
          <Reveal delay={0.1}>
            <p className="border-l-2 border-gold-brand pl-5 text-sm leading-relaxed text-ink-muted">
              Four chapters. One living inheritance, held in public rites, neighbourhood companies, ceremony, sound and food.
            </p>
          </Reveal>
        </div>

        <article
          id="ritual"
          aria-labelledby="ritual-title"
          className="scroll-mt-24 border-t border-green/15 pt-12 mt-14 sm:pt-16 sm:mt-20"
        >
          <div className="grid min-w-0 gap-10 lg:grid-cols-12 lg:items-center lg:gap-12">
            <Reveal className="min-w-0 lg:col-span-5">
              <ChapterMark number="01" symbol={fetu.symbol} />
              <h3 id="ritual-title" className="mt-6 text-3xl font-semibold leading-tight text-ink sm:text-4xl">
                {fetu.title}
              </h3>
              <p className="mt-5 text-lg leading-relaxed text-ink-muted">{fetu.body}</p>
              <dl className="mt-8 grid grid-cols-2 gap-4 border-y border-green/15 py-5">
                <div>
                  <dt className="text-[0.68rem] font-semibold tracking-[0.18em] text-ink-faint">WHEN</dt>
                  <dd className="mt-1 font-semibold text-ink">First Saturday of September</dd>
                </div>
                <div>
                  <dt className="text-[0.68rem] font-semibold tracking-[0.18em] text-ink-faint">DURBAR</dt>
                  <dd className="mt-1 font-semibold text-ink">Victoria Park</dd>
                </div>
              </dl>
              <ChapterLink href="/festivals">Enter the festival guide</ChapterLink>
            </Reveal>

            <Reveal className="min-w-0 lg:col-span-7" delay={0.08}>
              <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1.65fr)_minmax(9rem,0.7fr)] sm:items-end">
                <CulturePhoto
                  src="/uploads/seed/fetu-procession.jpg"
                  alt="A Fetu Afahye procession beneath ceremonial umbrellas in Cape Coast"
                  caption="Fetu Afahye in Oguaa · contextual photography"
                  className="aspect-[3/2]"
                  imageClassName="object-center"
                />
                <CulturePhoto
                  src="/uploads/seed/fetu-flagbearer.jpg"
                  alt="A ceremonial flag bearer carrying a company flag"
                  caption="Flag, procession and public memory · contextual photography"
                  className="aspect-[4/5] sm:mb-8"
                  imageClassName="object-center"
                />
              </div>
            </Reveal>
          </div>
        </article>

        <article
          id="asafo"
          aria-labelledby="asafo-title"
          className="scroll-mt-24 border-t border-green/15 pt-12 mt-16 sm:pt-16 sm:mt-24"
        >
          <div className="grid min-w-0 gap-10 lg:grid-cols-12 lg:items-center lg:gap-14">
            <Reveal className="order-2 min-w-0 lg:order-1 lg:col-span-7">
              <CulturePhoto
                src="/uploads/seed/posuban.jpg"
                alt="A sculpted Asafo company shrine"
                caption="An Asafo company shrine · contextual photography"
                className="aspect-[4/3]"
                imageClassName="object-center"
              />
            </Reveal>

            <Reveal className="order-1 min-w-0 lg:order-2 lg:col-span-5" delay={0.08}>
              <ChapterMark number="02" symbol={asafo.symbol} />
              <h3 id="asafo-title" className="mt-6 text-3xl font-semibold leading-tight text-ink sm:text-4xl">
                {asafo.title}
              </h3>
              <p className="mt-5 text-lg leading-relaxed text-ink-muted">{asafo.body}</p>
              <Stagger as="ol" className="mt-8 grid grid-cols-2 gap-x-5 border-y border-green/15 py-4 sm:grid-cols-3 lg:grid-cols-2">
                {COMPANIES.map((company, index) => (
                  <StaggerItem as="li" key={company} index={index} className="flex items-baseline gap-2 border-b border-green/10 py-3 last:border-b-0">
                    <span className="text-[0.68rem] font-semibold text-gold-text" aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="font-semibold text-ink">{company}</span>
                  </StaggerItem>
                ))}
              </Stagger>
            </Reveal>
          </div>
        </article>

        <article
          id="durbar"
          aria-labelledby="durbar-title"
          className="on-dark on-dark-pin scroll-mt-24 mt-16 overflow-hidden rounded-[2rem] bg-green-900 text-cream shadow-[0_30px_80px_rgba(12,44,31,0.22)] sm:mt-24 sm:rounded-[2.5rem]"
        >
          <div className="grid min-w-0 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-stretch">
            <Reveal className="flex min-w-0 flex-col justify-center p-7 sm:p-10 lg:p-14">
              <ChapterMark number="03" symbol={durbar.symbol} dark />
              <h3 id="durbar-title" className="mt-7 text-3xl font-semibold leading-tight text-cream sm:text-4xl">
                {durbar.title}
              </h3>
              <p className="mt-5 text-lg leading-relaxed text-cream/80">{durbar.body}</p>
              <ul className="mt-8 flex flex-wrap gap-2" aria-label="Durbar ceremonial forms">
                {["Palanquins", "Linguist staffs", "Fontomfrom drums"].map((item) => (
                  <li key={item} className="rounded-full border border-cream/20 bg-cream/[0.06] px-4 py-2 text-sm font-medium text-cream/85">
                    {item}
                  </li>
                ))}
              </ul>
              <ChapterLink href="/festivals#rite" dark>Read the rites and regalia</ChapterLink>
            </Reveal>
            <figure className="relative min-h-[28rem] min-w-0 bg-green sm:min-h-[34rem] lg:min-h-full">
              <img
                src={mediaUrl("/uploads/seed/fetu-queenmother.jpg")}
                alt="A woman in ceremonial cloth and gold regalia beneath a state umbrella"
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover object-top"
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-green-900/90 to-transparent px-6 pb-6 pt-20 sm:px-8" aria-hidden="true" />
              <figcaption className="absolute inset-x-0 bottom-0 px-6 pb-5 text-xs font-medium leading-relaxed text-cream/80 sm:px-8">
                Ceremony and regalia · contextual photography
              </figcaption>
            </figure>
          </div>
        </article>

        <article
          id="sound-table"
          aria-labelledby="sound-table-title"
          className="scroll-mt-24 border-t border-green/15 pt-12 mt-16 sm:pt-16 sm:mt-24"
        >
          <div className="grid min-w-0 gap-10 lg:grid-cols-12 lg:gap-14">
            <Reveal className="min-w-0 lg:col-span-5 lg:pt-8">
              <ChapterMark number="04" symbol={soundAndTable.symbol} />
              <h3 id="sound-table-title" className="mt-6 text-3xl font-semibold leading-tight text-ink sm:text-4xl">
                {soundAndTable.title}
              </h3>
              <p className="mt-5 text-lg leading-relaxed text-ink-muted">{soundAndTable.body}</p>
              <div className="mt-8 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-green px-4 py-5 text-cream">
                  <p className="text-[0.68rem] font-semibold tracking-[0.18em] text-gold">THE SOUND</p>
                  <p className="mt-2 text-sm leading-relaxed text-cream/80">Highlife · Gospel · Brass · Osode</p>
                </div>
                <div className="rounded-2xl bg-clay-text px-4 py-5 text-cream">
                  <p className="text-[0.68rem] font-semibold tracking-[0.18em] text-cream/90">THE TABLE</p>
                  <p className="mt-2 text-sm leading-relaxed text-cream/90">Kenkey · Fish · Fante-fante · Koobi</p>
                </div>
              </div>
              <ChapterLink href="/festivals#sound">Follow the sound</ChapterLink>
            </Reveal>

            <Reveal className="min-w-0 lg:col-span-7" delay={0.08}>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2 sm:items-end">
                <CulturePhoto
                  src="/uploads/seed/fishing-boats.jpg"
                  alt="Fante fishing boats along the Cape Coast shoreline"
                  caption="Fishing boats along the Cape Coast shore · contextual photography"
                  className="aspect-[3/2] sm:aspect-square"
                  imageClassName="object-center"
                />
                <CulturePhoto
                  src="/uploads/seed/kenkey-fish.jpg"
                  alt="A plate of Ghanaian kenkey with fried fish and pepper"
                  caption="Kenkey and fish · the taste of the coast"
                  className="aspect-square sm:mb-10"
                  imageClassName="object-center"
                />
              </div>
            </Reveal>
          </div>
        </article>
      </div>
    </Section>
  );
}
