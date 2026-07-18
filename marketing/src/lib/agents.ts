// The "Oguaa Outside" agent network — vetted people who run business and errands
// for Cape Coasters beyond the town — read LIVE from /api/agents (public, no
// auth). Mirrors the civic.ts / goals.ts hook shape: starts empty and fills once
// the backend answers; on error it stays empty (a marketing page never shows an
// error). Nothing here is hardcoded — every agent shown comes from the database.
import { useEffect, useState } from "react";

export interface Agent {
  displayName: string;
  headline: string;
  /** "individual" | "office" (an agent can be a person or a staffed office). */
  type: string;
  services: string[];
  coverageAreas: string[];
  ratingAvg: number;
  ratingCount: number;
  jobsCompleted: number;
}

const EMPTY: Agent[] = [];

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readAgent(value: unknown): Agent | null {
  if (value == null || typeof value !== "object") return null;
  const agent = value as Record<string, unknown>;
  if (typeof agent.displayName !== "string" || !agent.displayName.trim()) return null;

  return {
    displayName: agent.displayName.trim(),
    headline: typeof agent.headline === "string" ? agent.headline.trim() : "",
    type: typeof agent.type === "string" ? agent.type : "",
    services: strings(agent.services),
    coverageAreas: strings(agent.coverageAreas),
    ratingAvg: finiteNumber(agent.ratingAvg),
    ratingCount: Math.max(0, Math.trunc(finiteNumber(agent.ratingCount))),
    jobsCompleted: Math.max(0, Math.trunc(finiteNumber(agent.jobsCompleted))),
  };
}

/** Read /api/agents live (verified agents only, sorted by the backend). Starts
 *  empty and fills once the backend answers; stays empty silently on failure. */
export function useAgents(): Agent[] {
  const [agents, setAgents] = useState<Agent[]>(EMPTY);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/agents", {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("bad response"))))
      .then((d: unknown) => {
        if (Array.isArray(d)) setAgents(d.map(readAgent).filter((agent): agent is Agent => agent != null));
      })
      .catch(() => {
        /* stay empty silently */
      });
    return () => {
      controller.abort();
    };
  }, []);

  return agents;
}
