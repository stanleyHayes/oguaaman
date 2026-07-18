export const HELP_CATEGORIES = [
  "Start here",
  "Moderation",
  "Town operations",
  "Community",
  "Money",
  "Publishing",
  "Account",
] as const;

export type HelpCategory = (typeof HELP_CATEGORIES)[number];

export interface HelpTopic {
  id: string;
  path: string;
  title: string;
  kicker: string;
  category: HelpCategory;
  summary: string;
  steps: readonly string[];
  tips: readonly string[];
  keywords: readonly string[];
}

/**
 * Plain-text help copy for every primary destination in the admin console.
 * Keeping it data-only lets the drawer, guide and speech reader share exactly
 * the same guidance without rendering or parsing HTML.
 */
export const ADMIN_HELP_TOPICS: readonly HelpTopic[] = [
  {
    id: "overview",
    path: "/",
    title: "Overview",
    kicker: "Your command centre",
    category: "Start here",
    summary: "See the current health of Oguaa at a glance: moderation workload, community growth, publishing activity and the items that need attention.",
    steps: [
      "Scan the headline figures for changes since your last visit.",
      "Open Needs attention before starting lower-priority work.",
      "Use Quick actions to jump into a common stewardship task.",
    ],
    tips: ["Figures refresh automatically while this page is open.", "Use the global search to find a listing without leaving your current task."],
    keywords: ["dashboard", "stats", "metrics", "queue"],
  },
  {
    id: "moderation",
    path: "/moderation",
    title: "Review queue",
    kicker: "Publish with care",
    category: "Moderation",
    summary: "Review new and edited community submissions before they appear publicly. Decisions are recorded for accountability.",
    steps: [
      "Open the oldest or highest-priority submission.",
      "Check the title, description, category, contact details and media.",
      "Approve, request a correction or reject with a clear reason.",
    ],
    tips: ["Safety incidents and lost-and-found reports publish quickly and may need after-the-fact verification.", "Explain a rejection so the creator knows what to fix."],
    keywords: ["approve", "reject", "pending", "submission", "triage"],
  },
  {
    id: "listings",
    path: "/listings",
    title: "Listings",
    kicker: "One directory, many kinds",
    category: "Moderation",
    summary: "Browse every business, person, event, memory, opportunity, project and operational report held in the shared listings directory.",
    steps: [
      "Search by title or use the filters to narrow the directory.",
      "Open a record to inspect its full details and moderation history.",
      "Update its lifecycle state or featured placement only after checking the record.",
    ],
    tips: ["A listing type controls which fields and public page it uses.", "Unpublishing preserves the record while removing it from public view."],
    keywords: ["directory", "search", "filter", "feature", "unpublish"],
  },
  {
    id: "reports",
    path: "/reports",
    title: "Reports",
    kicker: "Community safeguarding",
    category: "Moderation",
    summary: "Investigate concerns submitted about public content and close the loop with an auditable outcome.",
    steps: [
      "Open an unresolved report and read the reason in context.",
      "Inspect the reported listing before deciding what action is proportionate.",
      "Resolve the report after the content decision has been completed.",
    ],
    tips: ["Prioritise immediate safety, impersonation and harmful-content reports.", "Do not resolve a report until any related listing action is complete."],
    keywords: ["flag", "abuse", "safeguarding", "resolve"],
  },
  {
    id: "incidents",
    path: "/incidents",
    title: "Incidents",
    kicker: "Safety operations",
    category: "Moderation",
    summary: "Track urgent community incidents from initial report through verification, response, resolution and recovery.",
    steps: [
      "Review new reports and confirm the place, time and available evidence.",
      "Move the operational status forward as responders verify and act.",
      "Record resolution or recovery only when the outcome is confirmed.",
    ],
    tips: ["Incident status describes the response, not the normal listing approval state.", "Keep sensitive personal details out of public notes."],
    keywords: ["safety", "rescue", "reported", "verified", "resolved"],
  },
  {
    id: "audit",
    path: "/audit",
    title: "Audit log",
    kicker: "Who, what, when and why",
    category: "Moderation",
    summary: "Review the permanent record of administrative and moderation actions across the platform.",
    steps: [
      "Start with the most recent entry or narrow the list to the event you are investigating.",
      "Confirm the actor, action, affected record and timestamp.",
      "Use the entry as evidence when following up on an operational question.",
    ],
    tips: ["Audit entries are evidence, not controls; make changes on the relevant operational page.", "Escalate unexplained privileged actions to a steward."],
    keywords: ["history", "activity", "accountability", "record"],
  },
  {
    id: "directives",
    path: "/directives",
    title: "Directives",
    kicker: "Official town alerts",
    category: "Town operations",
    summary: "Issue, update and retire authoritative public notices from trusted Oguaa institutions and stewards.",
    steps: [
      "Choose the issuing authority and write a clear, factual directive.",
      "Set the appropriate urgency and active period.",
      "Review the public wording before issuing or closing the directive.",
    ],
    tips: ["Use directives for actionable official information, not routine news.", "Include dates, places and a contact route when they help people act safely."],
    keywords: ["alert", "notice", "authority", "urgent"],
  },
  {
    id: "goals",
    path: "/goals",
    title: "Town goals",
    kicker: "Durbar commitments",
    category: "Town operations",
    summary: "Publish measurable community commitments and keep their progress visible between durbars.",
    steps: [
      "Create a goal with a clear outcome, owner and target date.",
      "Set the starting status and explain how success will be judged.",
      "Update progress and evidence as work advances.",
    ],
    tips: ["A strong goal names a place, measure and deadline.", "Progress notes should describe evidence, not only optimism."],
    keywords: ["target", "commitment", "progress", "accountability"],
  },
  {
    id: "civic-pledges",
    path: "/civic",
    title: "Civic pledges",
    kicker: "Better everyday habits",
    category: "Town operations",
    summary: "See the voluntary habits residents have pledged to keep or drop as part of building a better Cape Coast.",
    steps: [
      "Review overall participation and the most-selected behaviours.",
      "Filter the pledge records when investigating engagement patterns.",
      "Use aggregate results in community updates without exposing private choices.",
    ],
    tips: ["A resident's selections are private; report only aggregate patterns.", "Use this view to understand participation, not to rank individuals."],
    keywords: ["pledge", "habit", "behaviour", "participation"],
  },
  {
    id: "outside-agents",
    path: "/outside-agents",
    title: "Vetting queue",
    kicker: "Oguaa Outside background checks",
    category: "Community",
    summary: "Review local agent applications before they can accept paid, escrow-backed work for clients outside Cape Coast.",
    steps: [
      "Confirm the applicant's identity document and stated services.",
      "Call the guarantor and verify that the good-conduct bond has been posted.",
      "Verify, reject or suspend the agent with an accurate record of the decision.",
    ],
    tips: ["Only vetting officers and stewards can make a decision.", "Never approve an agent from profile copy alone; complete the background check."],
    keywords: ["outside", "agent", "vetting", "background", "bond", "guarantor"],
  },
  {
    id: "outside-disputes",
    path: "/outside-disputes",
    title: "Disputes",
    kicker: "Oguaa Outside escrow rulings",
    category: "Community",
    summary: "Investigate escalated agent jobs and rule on whether held escrow is released to the agent or refunded to the client.",
    steps: [
      "Read the job, dispute reason, parties and escrow figures together.",
      "Review the available evidence and decide whether to release or refund.",
      "Record a clear ruling note and forfeit a bond only when the agent is at fault.",
    ],
    tips: ["Only vetting officers and stewards can resolve a dispute.", "The ruling is a financial action; confirm the amount and outcome before submitting."],
    keywords: ["outside", "escrow", "release", "refund", "bond", "ruling"],
  },
  {
    id: "members",
    path: "/members",
    title: "Members",
    kicker: "People and permissions",
    category: "Community",
    summary: "Find member accounts, inspect community contributions and manage staff roles within your own authority.",
    steps: [
      "Search for a member by name or account information.",
      "Open the profile to review their role and contributions.",
      "Change a role only when the person has been approved for those responsibilities.",
    ],
    tips: ["Grant the least privilege a person needs.", "Role changes affect access immediately and are written to the audit log."],
    keywords: ["account", "role", "permission", "staff", "profile"],
  },
  {
    id: "institutions",
    path: "/institutions",
    title: "Institutions",
    kicker: "Verified community bodies",
    category: "Community",
    summary: "Maintain schools, traditional authorities, associations, faith groups, civic bodies and public services.",
    steps: [
      "Find or create the institution using its recognised public name.",
      "Review identity, contact, leadership and supporting details.",
      "Verify the institution only when its authority has been established.",
    ],
    tips: ["Verification is a trust signal, not a completeness badge.", "Keep official and community events correctly attributed."],
    keywords: ["school", "association", "verify", "organization"],
  },
  {
    id: "places",
    path: "/places",
    title: "Places",
    kicker: "Heritage and visitor information",
    category: "Community",
    summary: "Curate the places that help residents and visitors understand, navigate and experience Cape Coast.",
    steps: [
      "Review the place name, category, description and location.",
      "Add useful visitor details and a representative image.",
      "Confirm the map position before publishing the update.",
    ],
    tips: ["Use durable public information rather than temporary promotional copy.", "Accurate coordinates make the map and directions useful."],
    keywords: ["heritage", "visitor", "map", "location"],
  },
  {
    id: "claims",
    path: "/claims",
    title: "Claims",
    kicker: "Institution management requests",
    category: "Community",
    summary: "Review requests from members who want permission to manage an institution's information.",
    steps: [
      "Open the claim and confirm the claimant's stated relationship.",
      "Check available evidence against the institution's known contacts.",
      "Approve a credible claim or reject it with a useful reason.",
    ],
    tips: ["When evidence is uncertain, verify out of band before granting access.", "A claim grants management access; it does not automatically verify the institution."],
    keywords: ["ownership", "manage", "verification", "request"],
  },
  {
    id: "projects",
    path: "/projects",
    title: "Projects",
    kicker: "Community funding",
    category: "Community",
    summary: "Monitor approved community projects, their funding progress and the pledges credited to each campaign.",
    steps: [
      "Review active campaigns and compare funding against the target.",
      "Open a project to inspect its public story and payment activity.",
      "Follow up on unusual or stalled payment records through the appropriate finance workflow.",
    ],
    tips: ["Amounts are stored in pesewas and displayed as Ghana cedis.", "Only confirmed payments count toward the public amount raised."],
    keywords: ["funding", "campaign", "pledge", "donation"],
  },
  {
    id: "tickets",
    path: "/tickets",
    title: "Tickets",
    kicker: "Sales and gate operations",
    category: "Community",
    summary: "Track ticketed events, confirmed sales and admission activity at the gate.",
    steps: [
      "Choose a ticketed event to inspect its sales and ticket tiers.",
      "Search or scan a ticket reference when admitting a guest.",
      "Confirm the ticket is valid and not already checked in before admitting the holder.",
    ],
    tips: ["A ticket can be checked in only once.", "Resolve payment questions against the server-confirmed transaction, not a screenshot."],
    keywords: ["event", "sale", "check in", "gate", "admission"],
  },
  {
    id: "plans",
    path: "/plans",
    title: "Plans",
    kicker: "Subscription catalogue",
    category: "Money",
    summary: "Define the creator subscription plans available to businesses and other eligible accounts.",
    steps: [
      "Review the current name, price, interval and included benefits.",
      "Create or edit a plan using language creators can understand.",
      "Confirm the public offering before making it available.",
    ],
    tips: ["Keep the free plan available as the safe default.", "Changing a plan should not misrepresent benefits already purchased."],
    keywords: ["free", "supporter", "price", "benefit", "subscription"],
  },
  {
    id: "subscriptions",
    path: "/subscriptions",
    title: "Subscriptions",
    kicker: "Creator payments",
    category: "Money",
    summary: "Review plan purchases and the access periods granted to subscribed creator accounts.",
    steps: [
      "Scan recent payments and their confirmation status.",
      "Open the associated account or listing when investigating a subscription.",
      "Use the confirmed transaction and expiry date to answer access questions.",
    ],
    tips: ["Only server-verified payments should grant paid access.", "Do not treat an initiated payment as successful."],
    keywords: ["plan", "payment", "creator", "renewal", "expiry"],
  },
  {
    id: "revenue",
    path: "/revenue",
    title: "Revenue",
    kicker: "Platform money",
    category: "Money",
    summary: "Understand confirmed income across pledges, tickets, subscriptions and promotions.",
    steps: [
      "Choose the period you need and scan the total by revenue stream.",
      "Compare the summary with the underlying transaction list.",
      "Export or reference the figures only after checking the date range and confirmation state.",
    ],
    tips: ["Project pledges show platform fees separately from the amount credited to a project.", "All values originate as integer pesewas."],
    keywords: ["income", "finance", "fees", "payment", "money"],
  },
  {
    id: "newsroom",
    path: "/newsroom",
    title: "Newsroom",
    kicker: "Public reporting",
    category: "Publishing",
    summary: "Draft, edit and publish timely stories for the Oguaa public portal.",
    steps: [
      "Search existing stories before starting a duplicate article.",
      "Create a draft with a clear headline, summary, body and image.",
      "Preview the story, then publish when facts, links and attribution are ready.",
    ],
    tips: ["Save unfinished reporting as a draft.", "Use specific dates and sources for information that may change."],
    keywords: ["article", "story", "draft", "publish", "editor"],
  },
  {
    id: "compose",
    path: "/compose",
    title: "Compose with AI",
    kicker: "Assisted writing",
    category: "Publishing",
    summary: "Turn a brief into a useful draft or improve existing copy while keeping a human editor responsible for the result.",
    steps: [
      "Describe the audience, purpose and facts the draft must preserve.",
      "Generate or refine the copy, then read the entire result critically.",
      "Move usable copy into the appropriate editor and complete normal review before publishing.",
    ],
    tips: ["Never add private data or unsupported claims to a prompt.", "AI output is a draft; verify names, dates and facts yourself."],
    keywords: ["ai", "write", "draft", "rewrite", "copy"],
  },
  {
    id: "notifications",
    path: "/notifications",
    title: "Notifications",
    kicker: "Your back-office inbox",
    category: "Account",
    summary: "See moderation outcomes, claims, incidents and operational updates that need your awareness.",
    steps: [
      "Read unread items first and open the linked work when action is needed.",
      "Complete the task on its operational page.",
      "Mark notifications read as you clear the inbox.",
    ],
    tips: ["A notification is a pointer; the linked record remains the source of truth.", "Check urgent incident alerts before routine updates."],
    keywords: ["alert", "inbox", "unread", "update"],
  },
  {
    id: "profile",
    path: "/profile",
    title: "Profile",
    kicker: "Your staff identity",
    category: "Account",
    summary: "Review the identity attached to your administrative actions and update the public-safe profile details you control.",
    steps: [
      "Check your display name, biography and current role.",
      "Edit the fields that are inaccurate or incomplete.",
      "Save and confirm the updated details appear correctly.",
    ],
    tips: ["Your role is managed through the authorised member workflow, not this form.", "Use professional information appropriate for the back office."],
    keywords: ["name", "bio", "identity", "role"],
  },
  {
    id: "settings",
    path: "/settings",
    title: "Settings",
    kicker: "Security and operations",
    category: "Account",
    summary: "Manage your sign-in protection and inspect the platform configuration and operational controls available to your role.",
    steps: [
      "Review your two-factor authentication and recovery-code status.",
      "Use steward-only operations carefully and confirm the requested date or scope.",
      "Read configuration cards to understand how this environment is connected.",
    ],
    tips: ["Staff accounts should keep two-factor authentication enabled.", "Store recovery codes somewhere private and separate from your password."],
    keywords: ["security", "2fa", "totp", "configuration", "recovery"],
  },
  {
    id: "help",
    path: "/help",
    title: "Help & guide",
    kicker: "Learn the back office",
    category: "Start here",
    summary: "Search every admin topic, open the relevant workspace and listen to guidance using your browser's text-to-speech service.",
    steps: [
      "Search by a task, page or feature name.",
      "Choose a topic card, then follow its overview, steps and tips.",
      "Use Listen to hear the guide and Stop whenever you are done.",
    ],
    tips: ["The question-mark beside every page title opens guidance for that page.", "Text-to-speech stays on your device and depends on browser support."],
    keywords: ["guide", "support", "listen", "speech", "how to"],
  },
];

const HELP_BY_PATH = new Map(ADMIN_HELP_TOPICS.map((topic) => [topic.path, topic]));

const DETAIL_TOPICS: readonly HelpTopic[] = [
  {
    ...HELP_BY_PATH.get("/listings")!,
    id: "listing-detail",
    title: "Listing detail",
    kicker: "Inspect one public record",
    summary: "Review one listing's complete content, ownership and lifecycle before taking a moderation or placement action.",
  },
  {
    ...HELP_BY_PATH.get("/members")!,
    id: "member-detail",
    title: "Member detail",
    kicker: "Account context",
    summary: "Review one member's account, role and contributions before making a permission or support decision.",
  },
  {
    ...HELP_BY_PATH.get("/institutions")!,
    id: "institution-detail",
    title: "Institution detail",
    kicker: "A trusted community record",
    summary: "Inspect and maintain one institution's identity, leadership, offices, events and verification evidence.",
  },
  {
    ...HELP_BY_PATH.get("/newsroom")!,
    id: "article-editor",
    title: "Article editor",
    kicker: "From draft to publication",
    summary: "Write or revise one newsroom story, preview the result and publish only after editorial review.",
  },
];

const FALLBACK_TOPIC = HELP_BY_PATH.get("/help")!;

export function getAdminHelpTopic(pathname: string): HelpTopic {
  const cleanPath = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  const exact = HELP_BY_PATH.get(cleanPath);
  if (exact) return exact;
  if (cleanPath.startsWith("/listings/")) return DETAIL_TOPICS[0];
  if (cleanPath.startsWith("/members/")) return DETAIL_TOPICS[1];
  if (cleanPath.startsWith("/institutions/")) return DETAIL_TOPICS[2];
  if (cleanPath.startsWith("/newsroom/")) return DETAIL_TOPICS[3];
  const parent = ADMIN_HELP_TOPICS
    .filter((topic) => topic.path !== "/" && cleanPath.startsWith(`${topic.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];
  return parent ?? FALLBACK_TOPIC;
}

export function helpTopicToSpeech(topic: HelpTopic): string {
  const steps = topic.steps.map((step, index) => `Step ${index + 1}. ${step}`).join(" ");
  const tips = topic.tips.map((tip) => `Tip. ${tip}`).join(" ");
  return `${topic.title}. ${topic.kicker}. ${topic.summary} ${steps} ${tips}`;
}

export function helpGuideToSpeech(topics: readonly HelpTopic[]): string {
  return `Oguaa admin user guide. ${topics.map(helpTopicToSpeech).join(" ")}`;
}

const TOPIC_ROLE_ALLOWLIST: Readonly<Record<string, readonly string[]>> = {
  "/directives": ["curator", "steward"],
  "/goals": ["curator", "steward", "accountability"],
  "/civic": ["curator", "steward"],
  "/outside-agents": ["vetting", "steward"],
  "/outside-disputes": ["vetting", "steward"],
};

const MODERATOR_HELP_PATHS = new Set([
  "/moderation",
  "/listings",
  "/reports",
  "/incidents",
  "/notifications",
  "/profile",
  "/settings",
  "/help",
]);

/** Keep the guide as permission-aware as the sidebar and account menu. */
export function adminHelpTopicsForRole(role: string | undefined): readonly HelpTopic[] {
  return ADMIN_HELP_TOPICS.filter((topic) => {
    if (role === "moderator") return MODERATOR_HELP_PATHS.has(topic.path);
    const allowed = TOPIC_ROLE_ALLOWLIST[topic.path];
    return !allowed || (role != null && allowed.includes(role));
  });
}
