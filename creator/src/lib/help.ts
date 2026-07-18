export interface CreatorHelpTopic {
  id: string;
  title: string;
  kicker: string;
  overview: string;
  steps: readonly string[];
  tips: readonly string[];
  route?: string;
  routeLabel?: string;
}

const OVERVIEW: CreatorHelpTopic = {
  id: "overview",
  title: "Overview",
  kicker: "Your workspace at a glance",
  overview: "See the health of your creator workspace, recent activity, listing performance, and the tasks that need your attention.",
  steps: [
    "Review the headline numbers to understand what is live and what is still waiting.",
    "Use the activity and status panels to spot changes since your last visit.",
    "Open an attention item to continue the work on the right page.",
  ],
  tips: [
    "The overview is a starting point; your listings and earnings pages contain the full detail.",
    "Use the search bar at the top, or press slash, to find one of your listings quickly.",
  ],
  route: "/",
  routeLabel: "Open overview",
};

const LISTINGS: CreatorHelpTopic = {
  id: "listings",
  title: "Your listings",
  kicker: "Create, review and maintain",
  overview: "Manage every business, person, event, memory, project, opportunity, and other Oguaa listing connected to your account.",
  steps: [
    "Filter by status to focus on drafts, pending reviews, approved work, or rejected submissions.",
    "Open a listing to update its details, images, location, and contact information.",
    "Preview approved work on the public portal to confirm how visitors see it.",
  ],
  tips: [
    "Keep titles specific and descriptions easy to scan on a phone.",
    "A pending listing is locked while the Oguaa team reviews it; notifications will show the outcome.",
  ],
  route: "/work",
  routeLabel: "Open listings",
};

const EDIT_LISTING: CreatorHelpTopic = {
  id: "edit-listing",
  title: "Edit a listing",
  kicker: "Keep public information accurate",
  overview: "Update the public story, practical details, location, media, and type-specific information for this listing.",
  steps: [
    "Review the current details and correct anything that is out of date.",
    "Add clear images and complete the fields that help people find or understand the listing.",
    "Save your changes and follow the moderation status shown on the page.",
  ],
  tips: [
    "Only publish contact information that may safely appear on the public portal.",
    "Use the preview where available before submitting a substantial change.",
  ],
  route: "/work",
  routeLabel: "Back to listings",
};

const INSTITUTIONS: CreatorHelpTopic = {
  id: "institutions",
  title: "Institutions",
  kicker: "Manage verified organisations",
  overview: "Maintain the schools, associations, faith groups, civic bodies, and other institutions you are authorised to represent.",
  steps: [
    "Choose an institution to review its public profile and verification state.",
    "Keep identity, contact, leadership, and supporting information current.",
    "Use the team workspace when another trusted person should help manage it.",
  ],
  tips: [
    "Verification tells the community that an authorised representative manages the page.",
    "Make leadership or contact changes promptly so enquiries reach the right person.",
  ],
  route: "/institutions",
  routeLabel: "Open institutions",
};

const TEAM: CreatorHelpTopic = {
  id: "team",
  title: "Team workspace",
  kicker: "Share responsibility safely",
  overview: "Invite and manage the people who help maintain an institution without sharing your own sign-in details.",
  steps: [
    "Select an institution to see its current managers and pending invitations.",
    "Invite a trusted teammate using the email address tied to their Oguaa account.",
    "Review access regularly and remove people who no longer represent the institution.",
  ],
  tips: [
    "Give access only to people who are authorised to speak for the institution.",
    "Each teammate should use their own account and enable two-factor authentication.",
  ],
  route: "/team",
  routeLabel: "Open team workspace",
};

const WRITE: CreatorHelpTopic = {
  id: "write",
  title: "Write & publish",
  kicker: "Prepare stories for Oguaa",
  overview: "Draft and submit newsroom stories when writing access is enabled for your creator account.",
  steps: [
    "Start a draft and give the story a clear headline and introduction.",
    "Structure the body for easy reading, then add suitable supporting media.",
    "Review the preview and submit the finished story for editorial review.",
  ],
  tips: [
    "Confirm names, dates, places, and photo permissions before submitting.",
    "Save as you work, especially when your connection is unreliable.",
  ],
  route: "/write",
  routeLabel: "Open writing studio",
};

const GROW: CreatorHelpTopic = {
  id: "grow",
  title: "Promote & plan",
  kicker: "Reach more of the right people",
  overview: "Choose eligible work to promote, plan its visibility, and follow the campaign information connected to it.",
  steps: [
    "Choose the approved listing or work you want more people to discover.",
    "Review the promotion options, dates, and price before continuing to payment.",
    "Return here to follow active and completed promotion activity.",
  ],
  tips: [
    "Strengthen the listing title, image, and description before paying to promote it.",
    "Promotion increases visibility but does not replace accurate, useful content.",
  ],
  route: "/grow",
  routeLabel: "Open promotion tools",
};

const MONEY: CreatorHelpTopic = {
  id: "money",
  title: "Money",
  kicker: "Understand earnings and activity",
  overview: "Review payments connected to your work, including ticket sales, pledges, subscriptions, and other creator revenue shown for your account.",
  steps: [
    "Use the totals to understand the overall value recorded in the workspace.",
    "Review each revenue section to see what generated the amount.",
    "Use the dated activity to reconcile individual payments or follow up on questions.",
  ],
  tips: [
    "All values are shown in Ghana cedis even though payment records are stored securely in pesewas.",
    "A payment still being confirmed may not appear in a completed total immediately.",
  ],
  route: "/money",
  routeLabel: "Open money",
};

const NOTIFICATIONS: CreatorHelpTopic = {
  id: "notifications",
  title: "Notifications",
  kicker: "Keep up with important changes",
  overview: "Find moderation results, claims, reminders, and other updates connected to your listings and creator account.",
  steps: [
    "Open an unread notification to review its full context.",
    "Follow its link when an update needs action elsewhere in Oguaa.",
    "Use Mark all read after you have reviewed the outstanding messages.",
  ],
  tips: [
    "Rejected or change-requested work usually includes guidance you can use before resubmitting.",
    "Notification links may open the public portal when the update concerns public content.",
  ],
  route: "/notifications",
  routeLabel: "Open notifications",
};

const ACCOUNT: CreatorHelpTopic = {
  id: "account",
  title: "Profile",
  kicker: "Your public creator identity",
  overview: "Manage the profile information, photo, creator types, and community details connected to your Oguaa account.",
  steps: [
    "Review your name, photo, biography, and creator types.",
    "Update the details that should appear with your public contributions.",
    "Save the section and confirm that the success message appears.",
  ],
  tips: [
    "Choose a square, clear profile image and keep your biography concise.",
    "Account security and notification preferences live on the Settings page.",
  ],
  route: "/account",
  routeLabel: "Open profile",
};

const SETTINGS: CreatorHelpTopic = {
  id: "settings",
  title: "Settings",
  kicker: "Security and preferences",
  overview: "Control your working theme, notifications, password, two-factor authentication, privacy tools, and account access.",
  steps: [
    "Choose the appearance and notification preferences that suit your work.",
    "Use a strong password and enable two-factor authentication for better protection.",
    "Use the privacy tools when you need an export or want to manage your account data.",
  ],
  tips: [
    "Store recovery codes somewhere private and separate from this device.",
    "Signing out of a shared computer is an important part of protecting your work.",
  ],
  route: "/settings",
  routeLabel: "Open settings",
};

const HELP: CreatorHelpTopic = {
  id: "help",
  title: "Help guide",
  kicker: "Learn the creator workspace",
  overview: "Browse practical guidance for every main creator task, or use the help icon beside any page title for advice about the page you are viewing.",
  steps: [
    "Search or browse the guide topics below.",
    "Use Listen when you would rather hear a topic read aloud.",
    "Open the related workspace page when you are ready to continue.",
  ],
  tips: [
    "The question-mark icon beside the page title always opens guidance for your current page.",
    "Speech stays on your device and uses the voices supplied by your browser.",
  ],
  route: "/help",
  routeLabel: "Open help guide",
};

export const CREATOR_HELP_TOPICS = [
  OVERVIEW,
  LISTINGS,
  INSTITUTIONS,
  TEAM,
  WRITE,
  GROW,
  MONEY,
  NOTIFICATIONS,
  ACCOUNT,
  SETTINGS,
] as const;

export function creatorHelpTopic(pathname: string): CreatorHelpTopic {
  if (/^\/work\/[^/]+\/edit\/?$/.test(pathname)) return EDIT_LISTING;
  if (pathname === "/work" || pathname.startsWith("/work/")) return LISTINGS;
  if (pathname === "/institutions" || pathname.startsWith("/institutions/")) return INSTITUTIONS;
  if (pathname === "/team" || pathname.startsWith("/team/")) return TEAM;
  if (pathname === "/write" || pathname.startsWith("/write/")) return WRITE;
  if (pathname === "/grow" || pathname.startsWith("/grow/")) return GROW;
  if (pathname === "/money" || pathname.startsWith("/money/")) return MONEY;
  if (pathname === "/notifications" || pathname.startsWith("/notifications/")) return NOTIFICATIONS;
  if (pathname === "/account" || pathname.startsWith("/account/")) return ACCOUNT;
  if (pathname === "/settings" || pathname.startsWith("/settings/")) return SETTINGS;
  if (pathname === "/help" || pathname.startsWith("/help/")) return HELP;
  return OVERVIEW;
}

export function creatorHelpSpeech(topic: CreatorHelpTopic): string {
  const steps = topic.steps.map((step, index) => `Step ${index + 1}. ${step}`).join(" ");
  const tips = topic.tips.map((tip) => `Tip. ${tip}`).join(" ");
  return `${topic.title}. ${topic.overview} ${steps} ${tips}`;
}
