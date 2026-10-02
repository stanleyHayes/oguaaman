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
      "Open an unresolved report and read the reason, the target and the content as reported.",
      "Decide what is proportionate: dismiss, keep the content, remove it, or remove it and suspend the author.",
      "Write a short decision note and resolve — every report should be handled within 24 hours.",
    ],
    tips: ["Reports over 24 hours old are flagged in red; the most urgent reasons are listed first.", "Child-safety and intimate-image reports hide the content on arrival; dismissing puts it back."],
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
      "Call the guarantor and record what they confirm. No good-conduct bond is collected yet, so do not ask for one.",
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
      "Record a clear ruling note. Mark a bond forfeit only when the agent is at fault; no bond money is held yet, so it is a record only.",
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
    id: "privacy-requests",
    path: "/privacy-requests",
    title: "Privacy requests",
    kicker: "Data-rights requests",
    category: "Community",
    summary: "Handle access, correction, deletion and objection requests made through the public privacy-request form, before their due dates.",
    steps: [
      "Work the open requests from the earliest due date.",
      "Confirm who is asking before sharing or changing any data.",
      "Move the request to in progress, then completed or refused, with a note of what was done.",
    ],
    tips: ["Overdue requests are flagged in red.", "Refusing a request needs a note giving the reason."],
    keywords: ["privacy", "data protection", "access", "deletion", "correction", "objection"],
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
    tips: ["Every staff account must keep two-factor authentication on; staff tools stop working without it.", "Store recovery codes somewhere private and separate from your password."],
    keywords: ["security", "2fa", "totp", "configuration", "recovery"],
  },
  {
    id: "research-queue",
    path: "/newsroom/research",
    title: "Research queue",
    kicker: "AI-drafted reports waiting for an editor",
    category: "Publishing",
    summary: "See every researched report the news desk has drafted from a feed brief, what each one cost, and which drafts are ready for review. Nothing here is published until an editor approves it.",
    steps: [
      "Start with the Ready tab: these drafts passed the automatic checks.",
      "Open a story to read the draft against its numbered sources.",
      "Approve and publish, or reject with a reason. Rerun failed jobs only when the lead still matters.",
    ],
    tips: ["Today's spend sits at the top; the desk stops drafting when a cap is reached.", "Flags such as uncited claims are prompts to check, not automatic rejections."],
    keywords: ["ai", "research", "draft", "report", "claude", "sources", "queue"],
  },
  {
    id: "desk-settings",
    path: "/newsroom/desk",
    title: "Desk settings",
    kicker: "Switches and daily caps for automated news",
    category: "Publishing",
    summary: "Control the automated news desk: whether briefs publish on their own, whether long-form reports and AI illustrations are drafted, the daily spending caps and the blocked topics. AI-written reports always wait for an editor.",
    steps: [
      "Check that the API keys you need are configured.",
      "Change a switch or cap, then write the reason for the change.",
      "Save. The change and its reason appear in the change history.",
    ],
    tips: ["Only the steward can save; other staff see the settings read-only.", "Election mode stops AI drafting on political leads and uses branded covers."],
    keywords: ["news desk", "caps", "budget", "election mode", "images", "keywords"],
  },
  {
    id: "elections",
    path: "/elections",
    title: "Election calendar",
    kicker: "One calendar for news and ads",
    category: "Town operations",
    summary: "Record each election with its poll date. The calendar sets when political ads may run, when the blackout pauses them, and when the newsroom switches to election mode.",
    steps: [
      "Add the election name, kind, scope and poll date; the windows fill in from the poll date.",
      "Adjust the blackout end once results are declared, if needed.",
      "Save. Elections that political ads still reference cannot be deleted.",
    ],
    tips: ["All times are Accra time (GMT).", "During any blackout every political ad pauses, whatever the election's scope."],
    keywords: ["election", "blackout", "poll", "political ads", "election mode"],
  },
  {
    id: "ads",
    path: "/ads",
    title: "Ads",
    kicker: "Review, pause and track paid campaigns",
    category: "Money",
    summary: "Review submitted ads before the advertiser pays, then watch delivery, pause or remove campaigns, and follow refunds.",
    steps: [
      "Open an ad awaiting review and compare the creative, sponsor and landing page.",
      "Tick every checklist item that holds, then approve, or reject with a reason the advertiser will read.",
      "Political ads need two curators, or the steward.",
    ],
    tips: ["Ads must never look like news.", "A failed refund shows a flag in the queue; the steward can retry it by hand."],
    keywords: ["ads", "advertising", "campaign", "approve", "political ads", "refund"],
  },
  {
    id: "ad-sponsors",
    path: "/ad-sponsors",
    title: "Ad sponsors",
    kicker: "Who pays for each ad",
    category: "Money",
    summary: "Verify the people and organisations behind ads before their campaigns can be approved. Political sponsors must show a Ghana Card or registration and, for District Assembly races, the EC authorisation.",
    steps: [
      "Open a pending sponsor and read the documents.",
      "Verify, reject or suspend with a note. Suspending also pauses their running ads.",
    ],
    tips: ["Documents open privately with your staff session; they are never public links."],
    keywords: ["sponsor", "advertiser", "verify", "ghana card", "political"],
  },
  {
    id: "ad-pricing",
    path: "/ad-pricing",
    title: "Ad pricing",
    kicker: "The public rate card and ad switches",
    category: "Money",
    summary: "Set the CPM for each placement, the order limits, tax and the master switches for ads, political ads and app delivery. Every price applies to every advertiser and is public on the rate card.",
    steps: [
      "Change prices in cedis per 1,000 viewable impressions.",
      "Write the reason for the change and save.",
    ],
    tips: ["Quotes already given keep the price they were given.", "App delivery carries an app-store risk; keep it off until the owner decides."],
    keywords: ["cpm", "price", "rate card", "tax", "ads enabled", "inventory"],
  },
  {
    id: "ad-report",
    path: "/ad-report",
    title: "Ad report",
    kicker: "Delivery and income by placement",
    category: "Money",
    summary: "See opportunities, billable impressions, clicks, fill rate, recognised income and RPM for each placement over a date range, with political income shown on its own.",
    steps: ["Choose the date range.", "Read each placement row and the totals underneath."],
    tips: ["RPM is income per 1,000 opportunities; it is a report figure, not a price."],
    keywords: ["rpm", "ctr", "fill rate", "impressions", "report", "income"],
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
  {
    ...HELP_BY_PATH.get("/ads")!,
    id: "ad-detail",
    title: "Ad detail",
    kicker: "One campaign, start to finish",
    summary: "See the creative exactly as its slot shows it, the sponsor, compliance papers, price, delivery and refunds, and take the actions its status allows.",
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
  if (cleanPath.startsWith("/ads/")) return DETAIL_TOPICS[4];
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
  "/newsroom/research": ["curator", "editor", "steward"],
  "/newsroom/desk": ["curator", "editor", "steward"],
  "/ads": ["curator", "moderator", "steward"],
  "/ad-sponsors": ["curator", "moderator", "steward"],
  "/ad-pricing": ["curator", "steward"],
  "/ad-report": ["curator", "steward"],
  "/elections": ["curator", "steward"],
};

const MODERATOR_HELP_PATHS = new Set([
  "/moderation",
  "/listings",
  "/reports",
  "/incidents",
  "/ads",
  "/ad-sponsors",
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
