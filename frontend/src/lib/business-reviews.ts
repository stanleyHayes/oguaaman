import { api } from "./api";
import type { Review } from "./types";

export type ReviewSummary = { reviews: Review[]; ratingAvg: number; ratingCount: number };

export const NO_REVIEWS: ReviewSummary = { reviews: [], ratingAvg: 0, ratingCount: 0 };

/**
 * Reviews for a business, or an empty summary when they can't be loaded.
 * Shared by /business/:slug and /s/:handle so both loaders return the shape
 * BusinessDetail's Component reads.
 */
export function loadBusinessReviews(slug: string): Promise<ReviewSummary> {
  return api.businessReviews(slug).catch(() => NO_REVIEWS);
}
