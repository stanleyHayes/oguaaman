import { Section, SectionHeading } from "@/components/ui";
import { Adinkra, SymbolDivider, type AdinkraName } from "@/components/adinkra";
import { Stagger, StaggerItem } from "@/components/motion";

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
    <Section id="stories" tone="deep" size="wide">
      <SectionHeading
        onDark
        kicker="LEGENDS, HEROES & FOLKTALES"
        title="Told by the fire."
        lede="Every old town keeps its heroes and its tales. These are Oguaa's — founding legends, the valour of the Asafo, the men who crossed oceans and saved the land, and the spider-tales told here on the coast since before the castle. Some are legend, some are documented history; we have marked which is which."
      />

      <Stagger className="mt-14 grid gap-5 sm:grid-cols-2">
        {STORIES.map((s, i) => (
          <StaggerItem key={s.title} index={i} as="article" className="group relative flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-cream/12 bg-cream/[0.035] p-6 transition-colors hover:border-gold/45 sm:p-7">
            <Adinkra
              name={s.symbol}
              size={108}
              labelled={false}
              className="pointer-events-none absolute -right-4 -top-4 text-gold opacity-[0.07] transition-opacity group-hover:opacity-[0.12]"
            />
            <div className="relative flex flex-1 flex-col">
              <div className="flex items-center gap-3">
                <Adinkra name={s.symbol} size={26} labelled={false} className="text-gold" />
                <span className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-gold/90">{s.kind}</span>
              </div>
              <h3 className="mt-4 text-2xl font-semibold text-cream">{s.title}</h3>
              <p className="mt-3 leading-relaxed text-cream/80">{s.text}</p>
              <p className="mt-auto pt-4 text-xs italic text-cream/45">{s.note}</p>
            </div>
          </StaggerItem>
        ))}
      </Stagger>

      <SymbolDivider name="nyame-nwu-na-mawu" className="mt-16" tone="text-gold/70" />
      <p className="mx-auto mt-5 max-w-xl text-center font-serif text-base italic text-cream/70">
        Nyame nwu na mawu — &ldquo;God will not die, so I will not die.&rdquo; A told story never truly ends.
      </p>
    </Section>
  );
}
