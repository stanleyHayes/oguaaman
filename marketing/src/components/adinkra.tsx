import type { SVGProps } from "react";

/**
 * Respectful symbol vocabulary (agent_plan.md §2.4) — clean uniform-stroke line
 * icons that borrow the grammar of Adinkra; never reproductions of sacred or
 * company-specific marks. Each carries a tooltip teaching its name and meaning.
 * Shared with the client portal so the brand reads as one family.
 */

export type AdinkraName =
  | "adinkrahene" | "sankofa" | "nkyinkyim" | "gye-nyame"
  | "nyame-nwu-na-mawu" | "owuo-atwedee" | "funtunfunefu" | "dwennimmen" | "crab";

interface SymbolDef {
  name: string;
  meaning: string;
  path: React.ReactNode;
}

export const ADINKRA: Record<AdinkraName, SymbolDef> = {
  adinkrahene: {
    name: "Adinkrahene",
    meaning: "Leadership and the oneness of all things — the seed of all Adinkra.",
    path: (<><circle cx="12" cy="12" r="9.2" /><circle cx="12" cy="12" r="5.7" /><circle cx="12" cy="12" r="2.2" /></>),
  },
  sankofa: {
    name: "Sankofa (san kɔfa)",
    meaning: "Go back and fetch it — learn from the past to build the future.",
    path: (<><path d="M12 4.5C7.6 4.5 7.6 11 12 11s4.4-6.5 0-6.5" /><path d="M12 11v8.5" /><path d="M8 16.5 12 19.5 16 16.5" /></>),
  },
  nkyinkyim: {
    name: "Nkyinkyim",
    meaning: "The path of life is twisted — dynamism, adaptability, resilience.",
    path: <path d="M4 5h5v5h5v5h5" />,
  },
  "gye-nyame": {
    name: "Gye Nyame",
    meaning: "Except God — the omnipotence and supremacy of God.",
    path: (<><path d="M13 4a8 8 0 1 0 7 8" /><path d="M16 12a4 4 0 1 1-3.4-4" /><path d="M12.6 12a1.7 1.7 0 1 0 1.6-1.2" /></>),
  },
  "nyame-nwu-na-mawu": {
    name: "Nyame Nwu Na Mawu",
    meaning: "God will not die, therefore I will not die — the immortality of the soul.",
    path: (<><path d="M12 3v18M3 12h18" /><path d="M12 6.5 17.5 12 12 17.5 6.5 12Z" /></>),
  },
  "owuo-atwedee": {
    name: "Owuo Atwedeɛ",
    meaning: "Death's ladder is climbed by all — the universality of death; a consolation.",
    path: (<><path d="M8.5 3v18M15.5 3v18" /><path d="M8.5 7h7M8.5 11h7M8.5 15h7M8.5 19h7" /></>),
  },
  funtunfunefu: {
    name: "Funtunfunefu Denkyemfunefu",
    meaning: "Two crocodiles, one stomach — unity in diversity.",
    path: (<><path d="M3.5 7.5C8 7.5 9.5 12 12 12s4-4.5 8.5-4.5" /><path d="M3.5 16.5C8 16.5 9.5 12 12 12s4 4.5 8.5 4.5" /><circle cx="12" cy="12" r="1.6" /></>),
  },
  dwennimmen: {
    name: "Dwennimmen",
    meaning: "Ram's horns — strength tempered by humility; the heart, not the horns, leads.",
    path: (<><path d="M12 20.5V10" /><path d="M12 10c0-4-4.2-4-4.2-1 0 2.2 3 2.2 3 0" /><path d="M12 10c0-4 4.2-4 4.2-1 0 2.2-3 2.2-3 0" /></>),
  },
  crab: {
    name: "Kotokuraba (the crab)",
    meaning: "Oguaa's market origin — the crab-traders' selling-ground that became a town.",
    path: (<><path d="M12 9.5c-3 0-4.2 2-4.2 4S9.5 16.5 12 16.5s4.2-1 4.2-3-1.2-4-4.2-4Z" /><path d="M8 12.5 4.8 10.5 5.8 8M16 12.5l3.2-2-1-2.5" /><path d="M9 16.4 7.2 19.2M12 16.6V19.4M15 16.4l1.8 2.8" /></>),
  },
};

interface AdinkraProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: AdinkraName;
  size?: number;
  labelled?: boolean;
}

export function Adinkra({ name, size = 22, labelled = true, strokeWidth = 1.5, className, ...rest }: AdinkraProps) {
  const def = ADINKRA[name];
  const title = `${def.name} — ${def.meaning}`;
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      role={labelled ? "img" : "presentation"}
      aria-label={labelled ? title : undefined}
      aria-hidden={labelled ? undefined : true}
      className={className}
      {...rest}
    >
      {labelled && <title>{title}</title>}
      {def.path}
    </svg>
  );
}

export function SymbolDivider({ name = "adinkrahene", className = "", tone = "text-gold-brand" }: { name?: AdinkraName; className?: string; tone?: string }) {
  return (
    <div className={`mx-auto flex max-w-[260px] items-center gap-4 ${className}`} aria-hidden>
      <span className="h-px flex-1 bg-sand" />
      <Adinkra name={name} size={20} labelled={false} className={tone} />
      <span className="h-px flex-1 bg-sand" />
    </div>
  );
}
