import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

/**
 * Root HTML for the web build. The body font-family covers any stray text
 * node that bypasses the typography wrappers — Outfit is the default voice
 * everywhere; the bundled "Outfit_400Regular" face is injected by expo-font.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <style>{'body { font-family: "Outfit_400Regular", ui-sans-serif, system-ui, sans-serif; }'}</style>
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
