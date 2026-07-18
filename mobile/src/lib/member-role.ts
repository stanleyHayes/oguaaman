import type { MemberRole } from "./types";

const ROLE_LABELS: Readonly<Record<MemberRole, string>> = {
  member: "Member",
  curator: "Curator",
  steward: "Steward",
  editor: "Editor",
  moderator: "Moderator",
  accountability: "Accountability officer",
  vetting: "Vetting officer",
};

/** Human-readable staff/member role names shared by every profile surface. */
export function memberRoleLabel(role: string): string {
  return ROLE_LABELS[role as MemberRole] ?? "Member";
}
