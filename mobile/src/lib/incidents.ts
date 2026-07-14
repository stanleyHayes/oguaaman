import { C } from "@/theme";
import type { IncidentCategory, IncidentSeverity, IncidentStatus } from "./types";

// Shared labels & palette for the safety (incident) screens. Severity colours
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
  INCIDENT_STATUSES.map((x) => [x.value, x.label]),
) as Record<IncidentStatus, string>;

export const CATEGORY_LABEL: Record<IncidentCategory, string> = Object.fromEntries(
  INCIDENT_CATEGORIES.map((x) => [x.value, x.label]),
) as Record<IncidentCategory, string>;

export const SEVERITY_LABEL: Record<IncidentSeverity, string> = Object.fromEntries(
  INCIDENT_SEVERITIES.map((x) => [x.value, x.label]),
) as Record<IncidentSeverity, string>;

/** Badge colour per severity (text + border; backgrounds stay on cream/sand). */
export const SEVERITY_COLOR: Record<IncidentSeverity, string> = {
  critical: C.maroon,
  high: C.clayText,
  medium: C.goldText,
  low: C.tealText,
};

export const STATUS_COLOR: Record<IncidentStatus, string> = {
  reported: C.goldText,
  verified: C.tealText,
  responding: C.clayText,
  resolved: C.green,
  recovered: C.green,
};
