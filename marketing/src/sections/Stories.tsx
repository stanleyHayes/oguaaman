import { Section, SectionHeading } from "@/components/ui";
import { Adinkra, SymbolDivider, type AdinkraName } from "@/components/adinkra";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { mediaUrl } from "@/lib/media";

/**
 * Legends, heroes & folktales of Oguaa — an immersive "told by the fire" band
 * under the History timeline. Anansesem (spider-tales) were told at night, so
 * this section is dark and firelit on purpose.
 *
 * Content is drawn from Borbor Fante oral tradition and the documented record of
 * the coast. Where a tale is legend we say so; where it is history, the names
 * and dates are real (Sarbah 1864–1910; Quaque 1741–1816; Aggrey 1875–1927;
 * Sutherland 1924–1996). Nothing here is invented.
 */

interface Story {
  kind: string;
  symbol: AdinkraName;
  title: string;
  text: string;
  note: string;
}

const STORIES: Story[] = [
  {
    kind: "Founding legend",
    symbol: "nkyinkyim",
    title: "Oborbor — the journey of the three",
    text:
      "Fante tradition remembers a great migration south from Techiman, led by three: Obrumankoma the whale, Odapagyan the eagle, and Oson the elephant. Two fell on the long road and were honoured as ancestors; Oson led the people at last to Mankessim, where the priest raised the sacred grove of Nananom Mpow. From that root the Fante states — Oguaa among them — were born.",
    note: "Borbor Fante oral tradition",
  },
  {
    kind: "Origin legend",
    symbol: "crab",
    title: "Kotokuraba — why the crab is ours",
    text:
      "Where Cape Coast's great market now stands was once a wetland thick with crabs — Kotokuraba, said to mean “the river of crabs.” The little fighter that carries its house on its back and bows to no tide gave Oguaa both its market and its emblem. To this day, to take the crab is to take the town's own name.",
    note: "Local tradition; “Oguaa” from gua, to trade",
  },
  {
    kind: "Festival legend",
    symbol: "gye-nyame",
    title: "Fetu Afahye — thanks for deliverance",
    text:
      "It is told that a great sickness once swept Oguaa and lifted only after the people turned to the seventy-seven deities of the town. Each first Saturday of September, Fetu Afahye repays that debt: a ban on noise and fishing to let the land and lagoon rest, a purification, and then the durbar — chiefs in palanquins, Asafo flags flying, the whole town in colour.",
    note: "Oguaa festival tradition",
  },
  {
    kind: "Living valour",
    symbol: "dwennimmen",
    title: "The Asafo — the town's own shield",
    text:
      "Long before any police force, Oguaa defended itself. Its seven Asafo companies — Bentsir, Anaafo, Ntsin, Nkum, Brofomba, Akrampa and Amanful — were its warriors, its firefighters and its keepers of custom, each with its own colours, war-songs and posuban shrine. Their rivalry is fierce and their loyalty fiercer: in war and festival alike, the Asafo are the muscle and the memory of the town.",
    note: "Living tradition of Cape Coast",
  },
  {
    kind: "Hero of history",
    symbol: "funtunfunefu",
    title: "The lawyer who saved the land",
    text:
      "In 1897 the Crown moved to claim all “unused” land as its own. A Cape Coast son, John Mensah Sarbah — the first lawyer the Gold Coast ever produced — helped raise the Aborigines' Rights Protection Society, and the Fante chiefs and scholars fought the Lands Bill until it fell. The soil of the coast stayed in the people's hands. He wrote down Fante customary law so it could never again be dismissed as none.",
    note: "Documented history · ARPS, 1897",
  },
  {
    kind: "Hero of history",
    symbol: "sankofa",
    title: "Philip Quaque — the long way home",
    text:
      "In the 1750s a Cape Coast boy was sent across the ocean to England. He came back in 1765 the first African ordained a priest of the Church of England, and for half a century he taught the children of Oguaa inside the very castle on the shore. Sankofa: he went, he learned, and he carried it home.",
    note: "Documented history · Philip Quaque, 1741–1816",
  },
  {
    kind: "Fable",
    symbol: "adinkrahene",
    title: "Aggrey's eagle",
    text:
      "Kwegyir Aggrey of nearby Anomabu, the great teacher, loved to tell of an eagle reared among chickens that believed itself a chicken — until a man carried it to the mountain, turned it to the rising sun, and it remembered its wings and flew. So, he said, is Africa: made to soar, only needing to remember. “You can play a tune on the white keys, and a tune on the black,” he added, “but for harmony you must use both.”",
    note: "Fable popularised by K. A. Aggrey, 1875–1927",
  },
  {
    kind: "Folktale",
    symbol: "nyame-nwu-na-mawu",
    title: "How Ananse won all the stories",
    text:
      "Once every tale belonged to Nyame the Sky God, and the price was thought impossible: Onini the python, Osebo the leopard, the Mmoboro hornets, and Mmoatia the fairy. Tiny Kwaku Ananse the spider caught them all by wit alone — and so the stories came down to us, and we call them anansesem, “spider-tales.” Here on the coast, the playwright Efua Sutherland of Cape Coast built a whole theatre from them, so the spider still spins.",
    note: "Akan anansesem · Efua Sutherland, 1924–1996",
  },
];

export function Stories() {
  return (
    <Section id="stories" tone="deep" size="wide" className="relative scroll-mt-24 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-contours opacity-40" aria-hidden="true" />

      <div className="relative">
        <SectionHeading
          onDark
          kicker="LEGENDS, HEROES & FOLKTALES"
          title="Told by the fire."
          lede="Every old town keeps its heroes and its tales. These are Oguaa's — founding legends, the valour of the Asafo, the men who crossed oceans and saved the land, and the spider-tales told here on the coast since before the castle. Some are legend, some are documented history; we have marked which is which."
        />

        <div className="mt-14 grid min-w-0 gap-12 lg:grid-cols-[minmax(17rem,0.72fr)_minmax(0,1.28fr)] lg:items-start lg:gap-16">
          <Reveal className="min-w-0 lg:sticky lg:top-28">
            <figure>
              <div className="aspect-[4/5] overflow-hidden rounded-[var(--radius-card)] bg-green">
                <img
                  src={mediaUrl("/uploads/seed/market-women.jpg")}
                  alt="Women selling goods at a market in Ghana"
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover object-center"
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              </div>
              <figcaption className="mt-3 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs leading-relaxed text-cream/65">
                <span>Market life in Ghana · contextual photography</span>
                <span>
                  <a href="https://commons.wikimedia.org/wiki/File%3AMarket_women_in_Ghana.jpg" target="_blank" rel="noreferrer" className="underline decoration-current/40 underline-offset-2 hover:decoration-current">Fquasie</a>
                  {" · "}
                  <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer" className="underline decoration-current/40 underline-offset-2 hover:decoration-current">CC BY-SA 4.0</a>
                </span>
              </figcaption>
            </figure>
            <div className="mt-8 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-5 border-y border-cream/15 py-6">
              <p className="text-4xl font-semibold text-gold">08</p>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Oral archive</p>
                <p className="mt-2 text-sm leading-relaxed text-cream/70">Legend, living tradition, documented history, fable and folktale.</p>
              </div>
            </div>
          </Reveal>

          <Stagger as="ol" className="min-w-0 border-b border-cream/15">
            {STORIES.map((story, index) => {
              const titleId = `story-${index + 1}-title`;
              return (
                <StaggerItem key={story.title} index={index} as="li" className="group border-t border-cream/15 py-8 sm:py-10">
                  <article aria-labelledby={titleId} className="grid min-w-0 grid-cols-[3.25rem_minmax(0,1fr)] gap-4 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:gap-6">
                    <div className="pt-1" aria-hidden="true">
                      <span className="grid size-10 place-items-center rounded-full border border-gold/30 text-gold sm:size-12">
                        <Adinkra name={story.symbol} size={24} labelled={false} strokeWidth={1.4} />
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-[0.66rem] font-semibold tracking-[0.2em] text-cream/45" aria-hidden="true">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-gold/90">{story.kind}</p>
                      </div>
                      <h3 id={titleId} className="mt-3 text-2xl font-semibold leading-tight text-cream sm:text-3xl">{story.title}</h3>
                      <p className="mt-4 max-w-2xl leading-relaxed text-cream/80">{story.text}</p>
                      <p className="mt-5 border-l border-gold/35 pl-3 text-xs italic leading-relaxed text-cream/65">{story.note}</p>
                    </div>
                  </article>
                </StaggerItem>
              );
            })}
          </Stagger>
        </div>

        <SymbolDivider name="nyame-nwu-na-mawu" className="mt-16" tone="text-gold/70" />
        <p className="mx-auto mt-5 max-w-xl text-center text-base italic text-cream/70">
          Nyame nwu na mawu — &ldquo;God will not die, so I will not die.&rdquo; A told story never truly ends.
        </p>
      </div>
    </Section>
  );
}
