import { PHOTOS } from "./cape-coast-photos";

export interface VisitStop {
  slug: string;
  name: string;
  category: string;
  image: string;
  alt: string;
  summary: string;
  introduction: string;
  location: string;
  duration: string;
  bestTime: string;
  practical: string[];
  nearby: { label: string; to: string }[];
}

export const VISIT_STOPS: VisitStop[] = [
  {
    slug: "cape-coast-castle",
    name: "Cape Coast Castle",
    category: "History · UNESCO World Heritage",
    image: PHOTOS.capeCoastCastle,
    alt: "Cape Coast Castle overlooking the Atlantic Ocean",
    summary: "Stand at the Door of No Return—the heart of the diaspora homecoming and the place where Oguaa's pride and wound meet.",
    introduction: "Built and rebuilt by European powers from 1653, the Castle became the British headquarters of the transatlantic slave trade on the Gold Coast. Its bright courtyard sits directly above the dungeons. Visit slowly, take the guided tour and leave time afterwards to sit by the sea.",
    location: "Victoria Road, Cape Coast",
    duration: "2–3 hours",
    bestTime: "Morning, before the heat",
    practical: ["Tours run with trained guides", "The dungeon route includes stairs and enclosed spaces", "Photography rules can vary by room—ask your guide", "Carry water and dress for strong coastal sun"],
    nearby: [{ label: "Explore the full heritage record", to: "/education/cape-coast-castle" }, { label: "Walk onward to Chapel Square", to: "/education/chapel-square-cape-coast" }],
  },
  {
    slug: "kakum-national-park",
    name: "Kakum National Park",
    category: "Rainforest · Canopy walk",
    image: PHOTOS.kakum,
    alt: "The canopy walkway high above Kakum rainforest",
    summary: "Seven rope bridges carry you through the rainforest canopy, up to forty metres above the forest floor.",
    introduction: "Kakum protects one of Ghana's most accessible stretches of tropical rainforest. The celebrated 350-metre canopy walk moves between seven suspended bridges, with forest guides interpreting the trees, birds and wildlife below.",
    location: "Abrafo, about 33 km north",
    duration: "Half day",
    bestTime: "Arrive for the first walks",
    practical: ["Wear closed, secure shoes", "Bring water and light rain protection", "The bridges sway and may not suit severe fear of heights", "Arrange your return transport before entering"],
    nearby: [{ label: "Read the Kakum heritage profile", to: "/education/kakum-national-park" }, { label: "Add Hans Cottage to the route", to: "/education/hans-cottage-botel" }],
  },
  {
    slug: "coast-and-castles",
    name: "The coast & the castles",
    category: "Coastal route · Day trip",
    image: PHOTOS.elminaCastle,
    alt: "Elmina Castle beside the fishing harbour",
    summary: "Follow the Atlantic west through fishing harbours, beaches and Elmina's São Jorge da Mina.",
    introduction: "Cape Coast and Elmina sit on a short, historically dense stretch of shore. Pair the towns carefully: two castle tours in one day can be emotionally heavy, so leave room for the harbour, the beaches and the ordinary life of the coast between them.",
    location: "Cape Coast to Elmina, about 13 km",
    duration: "Full day",
    bestTime: "Early start; unhurried pace",
    practical: ["Use a local taxi or arrange a driver for the day", "Avoid compressing both castle tours if you need time to reflect", "Ask before photographing people at working harbours", "Finish before dusk if travelling onward"],
    nearby: [{ label: "Explore Elmina Castle", to: "/education/elmina-castle" }, { label: "Find the fishing shore", to: "/education/bakaano-fishing-shore" }],
  },
  {
    slug: "fante-kenkey",
    name: "Eat Fante kenkey",
    category: "Food · Local ritual",
    image: "/uploads/seed/kenkey-fish.jpg",
    alt: "Fante kenkey served with fresh fish and pepper",
    summary: "Dokonu is softer and sourer than its Ga cousin, wrapped in plantain leaves and served with fresh fish, shito and pepper.",
    introduction: "Fante kenkey is everyday Cape Coast food rather than a staged visitor experience. Order it with grilled or fried fish, fresh pepper and shito. Eat with your hands if you are comfortable, and let the person serving you guide the combination.",
    location: "Chop bars and food sellers across town",
    duration: "45–90 minutes",
    bestTime: "Lunch or early evening",
    practical: ["Ask what fish arrived that day", "Pepper can be very hot—start with a little", "Carry cash or mobile money", "Choose a busy local spot with good turnover"],
    nearby: [{ label: "Browse Kotokuraba Market", to: "/education/kotokuraba-market" }, { label: "Discover more of Oguaa culture", to: "/culture" }],
  },
];

export function visitStop(slug: string): VisitStop | undefined {
  return VISIT_STOPS.find((stop) => stop.slug === slug);
}
