import { PageHero } from "@/components/page-hero";
import { CanopyScene } from "@/components/scenes";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { Section, SectionHeading, Pill } from "@/components/ui";
import { mediaUrl } from "@/lib/media";
import { Sites } from "@/sections/Sites";
import { PlanYourVisit } from "@/sections/PlanYourVisit";

const CHAPTERS = [
  { href: "#field-guide", number: "01", label: "Choose a place", note: "Living field guides" },
  { href: "#plan", number: "02", label: "Build your stay", note: "One, two or three days" },
  { href: "#arrival", number: "03", label: "Make the journey", note: "Road, rhythm and timing" },
] as const;

const TRIP_BRIEF = [
  { value: "2½–3h", label: "from Accra by road" },
  { value: "33 km", label: "from castle to canopy" },
  { value: "Coast + forest", label: "in one easy stay" },
] as const;

const POSTCARDS = [
  {
    src: "/uploads/seed/castle-courtyard.jpg",
    alt: "Cape Coast Castle overlooking the Atlantic",
    caption: "Castle stone · Atlantic edge",
    className: "row-span-2 min-h-[25rem] sm:min-h-[32rem]",
  },
  {
    src: "/uploads/seed/kakum-canopy.jpg",
    alt: "The canopy walkway suspended above Kakum rainforest",
    caption: "Kakum · forty metres up",
    className: "min-h-48 sm:min-h-0",
  },
  {
    src: "/uploads/seed/beach-boats.jpg",
    alt: "Fishing canoes gathered along the Cape Coast shore",
    caption: "Bakaano · the morning fleet",
    className: "min-h-48 sm:min-h-0",
  },
] as const;

interface PostcardProps {
  src: string;
  alt: string;
  caption: string;
  className: string;
}

function Postcard({
  src,
  alt,
  caption,
  className,
}: Readonly<PostcardProps>) {
  return (
    <figure className={`on-dark-pin group relative isolate overflow-hidden rounded-[1.5rem] bg-green-900 shadow-[var(--shadow-card)] ${className}`}>
      <div className="absolute inset-0 bg-contours opacity-30" aria-hidden />
      <img
        src={mediaUrl(src)}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 size-full object-cover transition-transform duration-700 motion-safe:group-hover:scale-[1.025]"
        onError={(event) => { event.currentTarget.style.display = "none"; }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-green-900/80 via-transparent to-transparent" aria-hidden />
      <figcaption className="absolute inset-x-0 bottom-0 p-5 font-mono text-[0.62rem] uppercase tracking-[0.17em] text-cream/85">
        {caption}
      </figcaption>
    </figure>
  );
}

function VisitPrelude() {
  return (
    <Section tone="paper" size="wide" className="relative overflow-hidden">
      <span className="pointer-events-none absolute -right-28 top-10 size-80 rounded-full bg-teal/[0.07] blur-3xl" aria-hidden />
      <div className="relative grid min-w-0 gap-12 lg:grid-cols-12 lg:items-center lg:gap-16">
        <Stagger className="grid min-w-0 gap-3 sm:grid-cols-[1.35fr_0.85fr] sm:grid-rows-2 lg:col-span-7">
          {POSTCARDS.map((postcard, index) => (
            <StaggerItem key={postcard.src} index={index} className={postcard.className}>
              <Postcard {...postcard} className="h-full min-h-48" />
            </StaggerItem>
          ))}
        </Stagger>

        <div className="min-w-0 lg:col-span-5">
          <SectionHeading
            kicker="THE OGUAA WEEKENDER"
            title="A city break with a rainforest attached."
            lede="Cape Coast is compact enough to understand in a weekend and layered enough to stay with you for years. Begin at the Atlantic, climb into town, then wake early for the forest."
          />
          <Reveal delay={0.08}>
            <div className="mt-8 flex flex-wrap gap-2">
              <Pill tone="gold">History held soberly</Pill>
              <Pill tone="green">Rainforest before noon</Pill>
              <Pill tone="teal">Town life after</Pill>
            </div>

            <dl className="mt-9 divide-y divide-green/15 border-y border-green/15">
              {TRIP_BRIEF.map((item) => (
                <div key={item.value} className="grid grid-cols-[7.5rem_1fr] items-baseline gap-5 py-4 sm:grid-cols-[9rem_1fr]">
                  <dt className="text-2xl font-semibold text-green">{item.value}</dt>
                  <dd className="text-sm text-ink-muted">{item.label}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#field-guide" className="inline-flex min-h-11 items-center justify-center rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-green-900">
                Explore the field guide <span aria-hidden>↓</span>
              </a>
              <a href="#plan" className="inline-flex min-h-11 items-center justify-center rounded-full border border-green/25 px-5 py-2.5 text-sm font-semibold text-green transition-colors hover:border-green hover:bg-green/[0.04]">
                Build a stay
              </a>
            </div>
          </Reveal>
        </div>
      </div>
    </Section>
  );
}

export function Component() {
  return (
    <>
      <PageHero
        scene={CanopyScene}
        coverUrl="/uploads/seed/castle-courtyard.jpg"
        kicker="Visit"
        title="Come for the castle. Stay for the whole coast."
        lede="A field guide to Cape Coast — castle stone and canoe shore, market mornings and rainforest canopy, all within one remarkable stretch of Ghana."
      >
        <nav
          aria-label="Visit page chapters"
          className="grid max-w-4xl overflow-hidden rounded-[1.25rem] border border-cream/20 bg-green-900/65 shadow-lg backdrop-blur-md sm:grid-cols-3"
        >
          {CHAPTERS.map((chapter, index) => (
            <a
              key={chapter.href}
              href={chapter.href}
              className={`group min-h-20 px-5 py-4 text-left transition-colors hover:bg-cream/10 ${index < CHAPTERS.length - 1 ? "border-b border-cream/15 sm:border-b-0 sm:border-r" : ""}`}
            >
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-gold">{chapter.number} · {chapter.note}</span>
              <span className="mt-1 block font-semibold text-cream transition-colors group-hover:text-gold">{chapter.label}</span>
            </a>
          ))}
        </nav>
      </PageHero>
      <VisitPrelude />
      <Sites />
      <PlanYourVisit />
    </>
  );
}
