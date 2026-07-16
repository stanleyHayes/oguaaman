import { useEffect } from "react";

const SITE = "Oguaa";

/**
 * Sets `document.title` for the current page and resets it on unmount.
 * Pass undefined/null to use the bare site name.
 */
export function usePageTitle(title?: string | null) {
  useEffect(() => {
    document.title = title ? `${title} · ${SITE}` : SITE;
    return () => {
      document.title = SITE;
    };
  }, [title]);
}
