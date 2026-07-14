import type { IncidentCategory, IncidentSeverity, IncidentStatus } from "./types";

// Shared labels & palette for the safety (incident) pages. Severity colours
// follow the app palette: critical=maroon, high=clay, medium=gold, low=teal.

export const INCIDENT_CATEGORIES: { value: IncidentCategory; label: string }[] = [
  { value: "flood", label: "Flood" },
  { value: "fire", label: "Fire" },
  { value: "accident", label: "Accident" },
  { value: "medical", label: "Medical" },
  { value: "crime", label: "Crime" },
  { value: "utility", label: "Utility" },
  { value: "other", label: "Other" },
];

export const INCIDENT_SEVERITIES: { value: IncidentSeverity; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

export const INCIDENT_STATUSES: { value: IncidentStatus; label: string }[] = [
  { value: "reported", label: "Reported" },
  { value: "verified", label: "Verified" },
  { value: "responding", label: "Responding" },
  { value: "resolved", label: "Resolved" },
  { value: "recovered", label: "Recovered" },
];

export const STATUS_LABEL: Record<IncidentStatus, string> = Object.fromEntries(
  INCIDENT_STATUSES.map((s) => [s.value, s.label]),
) as Record<IncidentStatus, string>;

export const CATEGORY_LABEL: Record<IncidentCategory, string> = Object.fromEntries(
  INCIDENT_CATEGORIES.map((c) => [c.value, c.label]),
) as Record<IncidentCategory, string>;

/** Badge classes per severity, mirroring the Pill palette in components/ui. */
export const SEVERITY_CLASS: Record<IncidentSeverity, string> = {
  critical: "border-maroon-900/40 bg-maroon-900/[0.08] text-maroon-900",
  high: "border-clay/30 bg-clay/[0.08] text-clay-text",
  medium: "border-gold-border/40 bg-gold/[0.12] text-gold-text",
  low: "border-teal/30 bg-teal/[0.09] text-teal-text",
};
