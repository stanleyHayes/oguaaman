import { type LoaderFunctionArgs } from "react-router-dom";
import { api } from "@/lib/api";
import type { Plan } from "@/lib/types";

// The shareable custom URL /s/:handle. It resolves a business by its clean
// storefront handle and renders the exact same page as /business/:slug (Component
// is re-exported), so the shared link IS the storefront — subdomain-ready later.
export { Component } from "./BusinessDetail";

export async function loader({ params }: LoaderFunctionArgs) {
  const [business, plans] = await Promise.all([
    api.storefront(params.handle as string),
    api.plans().catch(() => [] as Plan[]),
  ]);
  return { business, plans };
}
