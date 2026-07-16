import { useEffect } from "react";
import { api } from "./api";

/**
 * Fire the listing view ping once per mount. The server dedupes to one view
 * per listing per day per visitor (member ID when signed in, IP otherwise),
 * so repeated visits don't inflate the count. Fire-and-forget: a failed ping
 * must never break the page.
 */
export function useRecordView(id: string | undefined) {
  useEffect(() => {
    if (!id) return;
    api.recordView(id).catch(() => {});
  }, [id]);
}
