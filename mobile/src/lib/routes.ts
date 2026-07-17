import type { Href } from "expo-router";

// Named routes used across the mobile app. Centralised so renames don't leave
// stale strings scattered through screens, and to satisfy SonarQube S1192.
export const ROUTES = {
  home: "/",
  signIn: "/signin",
  me: "/me",
  settings: "/settings",
  studio: "/studio",
  studioWork: "/studio/work",
  studioTeam: "/studio/team",
  studioGrow: "/studio/grow",
  submit: "/submit",
  write: "/write",
  alerts: "/alerts",
  notifications: "/notifications",
  diaspora: "/diaspora",
  projects: "/projects",
  festivals: "/festivals",
  institutions: "/institutions",
  lostFound: "/lost-found",
  lostFoundNew: "/lost-found/new",
  safety: "/safety",
  safetyReport: "/safety/report",
  explore: "/explore",
  news: "/news",
  music: "/music",
  oguaaSound: "/music/the-oguaa-sound",
  youth: "/youth",
  search: "/search",
  browseEvents: "/browse/events",
  browsePeople: "/browse/people",
  browseBusinesses: "/browse/business",
  browseOpportunities: "/browse/opportunity",
  browseMemories: "/browse/memory",
  browseProjects: "/browse/project",
  exploreHeritage: "/explore/heritage",
  exploreCulture: "/explore/culture",
  exploreVisit: "/explore/visit",
  legalTerms: "/legal/terms",
  legalPrivacy: "/legal/privacy",
  legalAcceptableUse: "/legal/acceptable-use",
  legalSafeguarding: "/legal/safeguarding",
  studioMoney: "/studio/money",
} as const;

// Dynamic-segment paths are string templates, but expo-router's Link/router
// APIs want the typed Href. This centralises that one cast so screens can pass
// route builders straight to <Link href> / router.push without per-call casts.
const dyn = (path: string): Href => path as Href;

// Route builders for dynamic segments — keeps route templates in one place.
export const route = {
  event: (slug: string) => dyn(`/events/${slug}`),
  festival: (slug: string) => dyn(`/festivals/${slug}`),
  person: (slug: string) => dyn(`/people/${slug}`),
  member: (slug: string) => dyn(`/members/${slug}`),
  business: (slug: string) => dyn(`/business/${slug}`),
  project: (slug: string) => dyn(`/projects/${slug}`),
  newsArticle: (slug: string) => dyn(`/news/${slug}`),
  music: (slug: string) => dyn(`/music/${slug}`),
  memoriam: (slug: string) => dyn(`/memoriam/${slug}`),
  lostFound: (slug: string) => dyn(`/lost-found/${slug}`),
  safety: (slug: string) => dyn(`/safety/${slug}`),
  institution: (slug: string) => dyn(`/institutions/${slug}`),
  institutionManage: (slug: string) => dyn(`/institutions/${slug}/manage`),
  listingEdit: (id: string) => dyn(`/listings/${id}/edit`),
} as const;
