// Typed routing helpers. Expo Router's `Href` type is strict; these helpers let
// screen code pass ordinary strings while the cast is centralised in one place.
// This keeps the `as never` anti-pattern out of every screen and makes future
// migration to generated typed routes straightforward.
import { router, type Href } from "expo-router";

export function push(href: string) {
  router.push(href as Href);
}

export function replace(href: string) {
  router.replace(href as Href);
}

export function back() {
  router.back();
}
