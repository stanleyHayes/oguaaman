import { createBrowserRouter } from "react-router-dom";
import { RootLayout, RootError } from "./routes/root";

// Per-route metadata lives on each route's `handle`; RootLayout reads it via
// useMatches() and updates <title> + description/OG tags on navigation, so every
// page is shareable and findable (the SPA ships one static tag otherwise).
const SUFFIX = "Oguaa — the home of Cape Coast";

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RootError />,
    children: [
      { index: true, handle: { title: SUFFIX, description: "The community home of Cape Coast (Oguaa), Ghana — its history, culture, festivals, schools, people, businesses and the ones we remember. Made by us, for us." }, lazy: () => import("./pages/Home") },
      { path: "better", handle: { title: `Build a better Oguaa — ${SUFFIX}`, description: "The civic code of Cape Coast — the habits, from the self to the nation, that build a better town — and a pledge you can make today." }, lazy: () => import("./pages/BetterCapeCoast") },
      { path: "outside", handle: { title: `Oguaa Outside — trusted agents who act for you — ${SUFFIX}`, description: "A network of vetted, background-checked agents who handle business and errands for Cape Coast people beyond the town — procurement, shipping, inspection, travel and official errands — with managed escrow." }, lazy: () => import("./pages/OguaaOutside") },
      { path: "history", handle: { title: `History of Cape Coast — ${SUFFIX}`, description: "A Fante market that became a castle, a colonial capital, the nation's Citadel of Education, and a place of return for the African diaspora." }, lazy: () => import("./pages/HistoryPage") },
      { path: "culture", handle: { title: `Culture — ${SUFFIX}`, description: "Fetu Afahye, the seven Asafo companies, the posuban shrines and frankaa flags, the 77 gods and the durbar — the living culture of Oguaa." }, lazy: () => import("./pages/CulturePage") },
      { path: "festivals", handle: { title: `Festivals & Fetu Afahye — ${SUFFIX}`, description: "Fetu Afahye and the grand durbar, the diaspora's homecoming, and the wider coastal calendar — when Cape Coast stops to remember." }, lazy: () => import("./pages/FestivalsPage") },
      { path: "education", handle: { title: `Education — the Citadel of Education — ${SUFFIX}`, description: "The oldest school in Ghana and the foundations that taught a country — Mfantsipim, Adisadel, Wesley Girls', St. Augustine's, Holy Child and the University of Cape Coast." }, lazy: () => import("./pages/EducationPage") },
      { path: "visit", handle: { title: `Visit Cape Coast — the Castle, Kakum & the coast — ${SUFFIX}`, description: "Plan your visit to Cape Coast: the Castle and the Door of No Return, Kakum's canopy walk, Elmina and Assin Manso — how to get there, when to come, and what to eat." }, lazy: () => import("./pages/VisitPage") },
      { path: "visit/:slug", lazy: () => import("./pages/VisitPlace") },
      { path: "leadership", handle: { title: `Leadership — the two orders of Oguaa — ${SUFFIX}`, description: "The traditional chieftaincy and the civic government of Cape Coast, shown as two living hierarchies — from the Omanhene and the Asafo to the Assembly." }, lazy: () => import("./pages/LeadershipPage") },
      { path: "news", handle: { title: `News — the Oguaa Newsroom — ${SUFFIX}`, description: "Festivals, scholarships, homecomings and announcements from Cape Coast and its institutions. Free to read." }, lazy: () => import("./pages/NewsPage") },
      { path: "news/:slug", lazy: () => import("./pages/NewsArticlePage") },
      { path: "about", handle: { title: `About Oguaa — ${SUFFIX}`, description: "What Oguaa is building for Cape Coast and the diaspora: a living cultural archive, civic platform, and community home." }, lazy: () => import("./pages/AboutPage") },
      { path: "contact", handle: { title: `Contact Oguaa — ${SUFFIX}`, description: "How to reach the Oguaa team for support, partnerships, corrections, and stewardship of Cape Coast's public memory." }, lazy: () => import("./pages/ContactPage") },
      { path: "privacy", handle: { title: `Privacy — ${SUFFIX}` }, lazy: () => import("./pages/PrivacyPage") },
      { path: "terms", handle: { title: `Terms — ${SUFFIX}` }, lazy: () => import("./pages/TermsPage") },
    ],
  },
]);
