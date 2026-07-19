// The town's civic goals — the public accountability trail — read LIVE from
// /api/goals (public, no auth). Mirrors the civic.ts hook shape: starts empty
// and fills once the backend answers; on error it stays empty (a marketing page
// never shows an error). Nothing here is hardcoded — every goal, status and
// review verdict comes from the database (status is already computed server-side).
import { useEffect, useState } from "react";
import { apiUrl } from "./api";

export type GoalCadence =
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "annual";

export type GoalStatus = "active" | "pending_review" | "achieved" | "missed";

export type GoalRing = "self" | "home" | "school" | "work" | "town" | "nation";

export interface Goal {
  id: string;
  slug: string;
  title: string;
  description: string;
  target?: string;
  cadence: GoalCadence;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  status: GoalStatus;
  reviewNote?: string;
  reviewedById?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  setAtDurbar: boolean;
  ring?: GoalRing;
  featured: boolean;
  createdById: string;
  createdByName?: string;
  createdAt: string;
  updatedAt?: string;
}

const EMPTY: Goal[] = [];

function isGoalArray(v: unknown): v is Goal[] {
  return (
    Array.isArray(v) &&
    v.every(
      (g) =>
        g != null &&
        typeof g === "object" &&
        typeof (g as Record<string, unknown>).id === "string" &&
        typeof (g as Record<string, unknown>).slug === "string"
    )
  );
}

/** Read /api/goals live (already sorted featured-first, broadest cadence, newest
 *  period by the backend). Starts empty and fills once the backend answers. */
export function useGoals(): Goal[] {
  const [goals, setGoals] = useState<Goal[]>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    fetch(apiUrl("/api/goals"), { headers: { Accept: "application/json" } })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("bad response"))))
      .then((d: unknown) => {
        if (!cancelled && isGoalArray(d)) setGoals(d);
      })
      .catch(() => {
        /* stay empty silently */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return goals;
}

/** Human labels for each cadence, for grouping "in progress now" goals. */
export const CADENCE_LABEL: Record<GoalCadence, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  semiannual: "Every six months",
  annual: "Yearly",
};

/** Breadth order (broadest first) so groups read the way the API sorts. */
export const CADENCE_ORDER: GoalCadence[] = [
  "annual",
  "semiannual",
  "quarterly",
  "monthly",
  "weekly",
  "daily",
];

/** One-word public label for each computed status. */
export const STATUS_LABEL: Record<GoalStatus, string> = {
  active: "In progress",
  pending_review: "Awaiting review",
  achieved: "Achieved",
  missed: "Missed",
};
