/**
 * Community copy — the single source for every user-facing community string.
 *
 * Voice: a friend who quit before you. Supportive, zero shame, plain human
 * language. Never "violation", "infraction", "flagged", "user", "moderation".
 * Rate limits read as a feature, not a punishment. Crisis copy is warm and
 * direct, never preachy.
 */

export const COMMUNITY_TAB_TITLE = 'Community';

/**
 * Keyed by group slug — keys MUST match the 6 seeded slugs in
 * convex/community.ts. Empty states invite the first post.
 */
export const COMMUNITY_GROUPS: Record<
  string,
  { name: string; description: string; emptyTitle: string; emptyBody: string }
> = {
  global: {
    name: 'Everyone',
    description: 'The whole community in one feed. Every group, every story.',
    emptyTitle: 'Quiet in here',
    emptyBody: 'Be the first voice today. Someone out there needs to hear it.',
  },
  'day-one-club': {
    name: 'Day One Club',
    description: 'Just quit or starting again. Every streak starts here.',
    emptyTitle: 'Every streak starts at day one',
    emptyBody: 'Say hi. The people here get exactly where you are.',
  },
  'cravings-right-now': {
    name: 'Cravings Right Now',
    description: 'Riding a craving this minute? Post it. It passes faster together.',
    emptyTitle: 'No cravings on the board',
    emptyBody: 'When one hits, drop it here. Someone will sit with you through it.',
  },
  milestones: {
    name: 'Milestones',
    description: '24 hours, 1 week, 100 days. Wins of every size live here.',
    emptyTitle: 'No wins posted yet',
    emptyBody: 'Big or small, your milestone gives someone else a map.',
  },
  'vaping-zyn': {
    name: 'Vaping & Pouches',
    description: 'Pods and pouches have their own battles. Fight them together.',
    emptyTitle: 'Nothing here yet',
    emptyBody: 'Quitting vapes and pouches is its own fight. Start the conversation.',
  },
  'relapse-restart': {
    name: 'Relapse & Restart',
    description: 'A slip is a data point, not a verdict. Restart without shame.',
    emptyTitle: 'No restarts shared yet',
    emptyBody: "If you slipped, you belong here. Day counts reset, but what you learned doesn't.",
  },
};

export const COMPOSER_PLACEHOLDER = "What's on your mind? You post under a pseudonym here.";
export const COMPOSER_COMMENT_PLACEHOLDER = 'Say something supportive…';
export const COMPOSER_PENDING_LINE = 'On its way. Your post will appear for everyone shortly.';
export const POST_FAILED = "Couldn't send that. Please try again";

/**
 * retryAtMs: epoch ms when posting reopens. Renders relative minutes, never a
 * wall-clock time. A pause framed as a feature — never a punishment.
 */
export const RATE_LIMIT_MESSAGE = (retryAtMs: number): string => {
  const mins = Math.max(1, Math.ceil((retryAtMs - Date.now()) / 60_000));
  return `You've shared a lot this hour. Nice! You can post again in about ${mins} min.`;
};

// Shadow-ban semantics mean authors see their post as normal; these exist for
// the pending state and any future surfacing. Honest but soft — never reveal
// the mechanics, never shame.
export const PENDING_NOTICE = 'Posts take a moment to appear for everyone.';
export const SHADOWED_NOTICE =
  'Some posts stay just between us when they include things like personal details. Yours is safe here.';

export const CRISIS_CARD = {
  title: "You matter, and you don't have to do this alone",
  body: "What you wrote sounds heavy. Quitting is hard, and so is everything around it. If you're in a dark place right now, real people are ready to listen. Free, anytime.",
  resources: [
    { name: '988 Suicide & Crisis Lifeline', detail: 'Call or text 988', url: 'tel:988' },
    { name: 'Crisis Text Line', detail: 'Text HOME to 741741', url: 'sms:741741' },
    { name: 'SAMHSA Helpline', detail: '1-800-662-4357 (24/7)', url: 'tel:18006624357' },
  ],
  dismissLabel: "I'm okay, close this",
} as const;

export const REPORT_CONFIRMATION =
  "Thanks for looking out. We review every report and act within 24 hours.";
export const MUTE_CONFIRMATION = (handle: string) =>
  `You won't see anything from ${handle} anymore, in any group, under any name.`;
export const UNMUTE_CONFIRMATION = (handle: string) => `${handle} is back in your feed.`;
export const REPORT_ACTION_LABEL = 'Report this post';
export const REPORT_COMMENT_ACTION_LABEL = 'Report this comment';
export const MUTE_ACTION_LABEL = (handle: string) => `Block ${handle}`;
export const REACTION_LABEL = 'With you';

/**
 * Report reasons (Guideline 1.2) — the picker the report action opens. Keys
 * land in communityReports.reason so triage can prioritize (self-harm first).
 */
export const REPORT_REASONS: { key: string; label: string }[] = [
  { key: 'self_harm', label: 'Someone might hurt themselves' },
  { key: 'harassment', label: 'Harassment or abuse' },
  { key: 'encouraging_use', label: 'Encouraging nicotine use' },
  { key: 'pii', label: 'Sharing personal information' },
  { key: 'other', label: 'Something else' },
];

/**
 * Zero-tolerance community rules (Guideline 1.2). Shown as a full-screen gate
 * with an affirmative "I Agree" before any community surface; acceptance is
 * stored server-side (users.communityRulesAcceptedAt) and enforced on write.
 */
export const COMMUNITY_RULES = {
  title: 'Our ground rules',
  intro:
    'This space works because it is safe. By continuing you agree to these rules. We have zero tolerance for objectionable content or abusive behavior. Break the rules and your content comes down and your access can be removed.',
  rules: [
    'Be kind. No harassment, bullying, hate, or attacks on anyone, ever.',
    'Never encourage nicotine use or pressure anyone toward a relapse.',
    "No personal info, yours or anyone else's. You post under a pseudonym; keep it that way.",
    'No spam, advertising, or selling, especially nicotine products.',
  ],
  enforcement:
    'Every post and comment is reviewed by an automated safety system (run by Anthropic) before others can see it. You can report anything and block any member; reports are reviewed and acted on within 24 hours.',
  contactLine: 'Questions or concerns? Reach us anytime: ',
  agreeLabel: 'I agree',
} as const;

export const BANNED_MESSAGE =
  'Your account has lost community access for breaking the ground rules. Email us to appeal.';
export const RULES_REQUIRED_MESSAGE = 'Please accept the community ground rules first.';
