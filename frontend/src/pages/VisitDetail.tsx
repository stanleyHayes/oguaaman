import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router-dom";
import { usePageTitle } from "@/lib/use-page-title";
import { Container, Eyebrow } from "@/components/ui";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { cldCover } from "@/lib/cloudinary";
import { visitStop, type VisitStop } from "@/lib/visit-data";

export function loader({ params }: LoaderFunctionArgs): VisitStop {
  const stop = visitStop(params.slug ?? "");
  if (!stop) throw new Response("Visit stop not found", { status: 404 });
  return stop;
}

export function Component() {
  const stop = useLoaderData() as VisitStop;
  usePageTitle(`${stop.name} · Visit Oguaa`);
  return (
    <article>
      <header className="on-dark-pin relative isolate min-h-[34rem] overflow-hidden bg-green-900 text-cream sm:min-h-[42rem]">
        <img src={cldCover(stop.image, 1500)} alt={stop.alt} fetchPriority="high" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-green-900 via-green-900/55 to-green-900/20" />
        <Container size="wide" className="relative flex min-h-[34rem] flex-col justify-between py-8 sm:min-h-[42rem] sm:py-12">
          <nav aria-label="Breadcrumb" className="text-sm text-cream/70"><Link to="/" className="hover:text-gold">Home</Link><span className="mx-2" aria-hidden>/</span><Link to="/visit" className="hover:text-gold">Visit</Link><span className="mx-2" aria-hidden>/</span><span aria-current="page" className="text-cream">{stop.name}</span></nav>
          <Reveal className="max-w-4xl pb-4"><Eyebrow className="text-gold">{stop.category}</Eyebrow><h1 className="mt-4 text-5xl font-semibold leading-[0.98] text-cream sm:text-7xl">{stop.name}</h1><p className="mt-6 max-w-2xl text-lg leading-relaxed text-cream/80 sm:text-xl">{stop.summary}</p></Reveal>
        </Container>
      </header>

      <Container size="wide" className="py-16 sm:py-24">
        <div className="grid gap-12 lg:grid-cols-[1.25fr_0.75fr] lg:gap-20">
          <div>
            <Reveal><Eyebrow className="text-teal-text">Know before you go</Eyebrow><h2 className="mt-4 text-4xl font-semibold sm:text-5xl">Make room for the place</h2><p className="mt-7 max-w-[42rem] text-xl leading-relaxed text-ink-muted">{stop.introduction}</p></Reveal>
            <Reveal className="mt-14"><h2 className="text-2xl font-semibold">Practical notes</h2><Stagger as="ul" className="mt-5 border-t border-sand">{stop.practical.map((note, index) => <StaggerItem as="li" key={note} className="grid grid-cols-[2rem_1fr] gap-4 border-b border-sand py-5"><span className="text-xs font-semibold text-gold-text tabular-nums">{String(index + 1).padStart(2, "0")}</span><span className="text-ink-muted">{note}</span></StaggerItem>)}</Stagger></Reveal>
          </div>
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="overflow-hidden rounded-[1.5rem] bg-cream"><div className="bg-teal p-6 text-cream"><Eyebrow className="text-cream/65">At a glance</Eyebrow><h2 className="mt-2 text-2xl font-semibold text-cream">Plan this stop</h2></div><dl className="divide-y divide-sand p-6"><div className="py-4"><dt className="text-xs uppercase tracking-widest text-ink-faint">Location</dt><dd className="mt-1 font-medium text-ink">{stop.location}</dd></div><div className="py-4"><dt className="text-xs uppercase tracking-widest text-ink-faint">Allow</dt><dd className="mt-1 font-medium text-ink">{stop.duration}</dd></div><div className="py-4"><dt className="text-xs uppercase tracking-widest text-ink-faint">Best time</dt><dd className="mt-1 font-medium text-ink">{stop.bestTime}</dd></div></dl></div>
            <div className="mt-5 space-y-3">{stop.nearby.map((item) => <Link key={item.to} to={item.to} className="group flex items-center justify-between border-b border-sand py-3 text-sm font-semibold text-green">{item.label}<span className="transition-transform group-hover:translate-x-1" aria-hidden>→</span></Link>)}</div>
          </aside>
        </div>
      </Container>

      <section className="bg-green-900 py-14 text-cream"><Container className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div><Eyebrow className="text-gold">Keep exploring</Eyebrow><h2 className="mt-2 text-3xl font-semibold text-cream">There is more to Oguaa</h2></div><Link to="/visit" className="w-fit border-b border-gold pb-1 font-semibold text-gold">Back to the visitor guide →</Link></Container></section>
    </article>
  );
}
