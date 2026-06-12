/**
 * Sage's system prompt builder — PURE (no Convex/RN imports) so it can be unit
 * tested and reused. Composes: persona (motivational-interviewing) + retrieved
 * RAG evidence + per-user context + routing contacts.
 *
 * The knowledge now lives in the RAG index (see convex/rag.ts). This prompt's
 * job is to keep Sage grounded in that retrieved evidence and to refuse to
 * invent specifics when retrieval comes back empty.
 */

export type RetrievedEvidence = {
  topic: string;
  sourceName: string;
  sourceUrl: string;
  text: string;
};

export type RoutingContacts = {
  quitline: { name: string; phone: string; url: string; note?: string };
  crisis: { name: string; phone: string; url: string; note?: string };
};

/**
 * STABLE persona + rules — identical every turn. Voice and guardrails only;
 * facts come from the injected evidence block, not from here.
 */
export const SAGE_PERSONA = [
  'You are Sage, an expert, warm, non-judgmental nicotine-cessation coach inside the HALE app.',
  'Use a MOTIVATIONAL INTERVIEWING style: lead with empathy and reflective listening, affirm effort, ask open questions, evoke the user’s own reasons to quit, and support their autonomy. Never shame, never lecture, never use forcing language ("you must", "you should").',
  'Some users are MINORS (teen vaping). NEVER prescribe nicotine-replacement doses, medications, mg amounts, titration, or anything requiring clinical judgment. You may explain options at a HIGH LEVEL only, then route medical decisions to a clinician or quitline.',
  'GROUND every concrete claim (timelines, symptoms, techniques, statistics) in the RETRIEVED EVIDENCE provided below. If the evidence does not cover the question, SAY SO plainly and stick to general principles — do NOT invent timelines, numbers, or medical specifics.',
  'Lean on evidence-based techniques where they fit: CBT, urge surfing, HALT (Hungry/Angry/Lonely/Tired), trigger planning, the 4 Ds, and the withdrawal timeline.',
  'Offer ONE specific, doable technique per reply (never a list), matched to what the user said. Keep replies short (2-4 sentences), encouraging, and concrete. Never shame a relapse — treat a slip as information, not failure.',
  'BE SPECIFIC, NOT GENERIC. Never open with filler validation like "It can be really tough to..." or "I want to acknowledge...". Reflect the user\'s OWN words in one short clause, then deliver a concrete, evidence-backed fact or technique with real specifics (a named technique, a timeline, a number from the evidence). A reply that could be sent to any user about any struggle is a failed reply.',
  'NEVER recommend buying, starting, switching to, or continuing ANY nicotine or tobacco product (vapes, pouches, cigarettes, e-cigarettes) — even framed as harm reduction — and never say where to obtain one. If the user asks about switching products (e.g. cigarettes to vaping), do not endorse it; route the decision to a clinician or the quitline.',
  'Whenever the conversation touches medications, nicotine-replacement therapy, pregnancy, or concerning physical symptoms, ALWAYS include a one-line reminder to check with a doctor or pharmacist before acting.',
  'This is supportive behavioral coaching, NOT medical advice.',
].join(' ');

/**
 * Compact, source-backed knowledge FLOOR (distilled from the NCI withdrawal fact
 * sheet). Always included so Sage stays competent even when the RAG index is
 * empty or unreachable; retrieved evidence layers on top and takes priority.
 */
export const CORE_KNOWLEDGE = [
  'Core withdrawal facts (general principles — defer to retrieved evidence when present):',
  '- Symptoms are worst the first week, peak on days 1-3, and ease over the first month; mild cravings can surface months later.',
  '- A single craving crests and passes within a few minutes (urge surfing); cravings come often early, then space out.',
  '- Irritability/anger peak in week 1, last 2-4 weeks; anxiety builds over ~3 days, lasts several weeks; low mood starts day 1 and usually lifts within a month.',
  '- Trouble concentrating, insomnia, headaches, fatigue, and increased appetite are common and temporary; weight gain is usually under 10 lbs and the health gains far outweigh it.',
  '- Techniques: the 4 Ds (Delay, Deep breaths, Drink water, Do something with your hands), move the body, HALT check, trigger planning, and reaching out to a person.',
].join(' ');

/**
 * Crisis / severe-symptom signals. If matched, Sage STOPS coaching and routes
 * to the crisis contact. Deliberately broad — false positives just add a
 * supportive "please reach out" line, which is the safe failure mode.
 */
const CRISIS_PATTERNS = [
  /\b(kill|hurt|harm)(ing)?\s+(myself|yourself)\b/i,
  /\b(suicid|self[-\s]?harm|end my life|want to die|don'?t want to (be alive|live)|no reason to live)\b/i,
  /\b(overdose|chest pain|can'?t breathe|trouble breathing|seizure|fainted|passing out|heart racing dangerously)\b/i,
];

/** Requests that need clinical judgment (dosing/medication decisions). */
const MEDICAL_DECISION_PATTERNS = [
  /\b(how (much|many)|what dose|dosage|how often)\b.*\b(nicotine|patch|gum|lozenge|spray|inhaler|bupropion|wellbutrin|chantix|varenicline|zyban|cytisine)\b/i,
  /\b(mg|milligram)s?\b.*\b(patch|gum|lozenge|nicotine|dose)\b/i,
  /\b(should i (take|use|start|stop|combine)|which (medication|drug)|prescri)/i,
];

export type RouteFlag = 'crisis' | 'medical' | null;

export function detectRouteFlag(message: string): RouteFlag {
  if (CRISIS_PATTERNS.some((re) => re.test(message))) return 'crisis';
  if (MEDICAL_DECISION_PATTERNS.some((re) => re.test(message))) return 'medical';
  return null;
}

/** Lightweight intent router → which key feeds TOPIC_ROUTES in sources.config. */
export function routeKey(message: string): string {
  const m = message.toLowerCase();
  if (/(relaps|slipped|slip up|caved|gave in|smoked again|vaped again|i failed)/.test(m)) return 'relapse';
  if (/(teen|kid|my son|my daughter|school|underage|vape pen|juul|disposable)/.test(m)) return 'teen';
  if (/(patch|gum|lozenge|nrt|bupropion|chantix|varenicline|medication|nicotine replacement)/.test(m)) return 'nrt';
  if (/(craving|urge|want to (smoke|vape)|need a (cig|hit|puff))/.test(m)) return 'craving';
  if (/(angry|anger|rage|furious|irritab|frustrat|snapp(ed|ing)|stress|overwhelm|anxious|anxiety|panic|moody|mood swing|depress|crying|emotional)/.test(m)) return 'mood';
  if (/(insomnia|can'?t sleep|sleep|appetite|weight|eating|hungry|exercise|workout|alcohol|when i drink|party|parties|social|friends who (smoke|vape)|coffee|caffeine)/.test(m)) return 'lifestyle';
  if (/(benefit|worth it|what improves|health (improve|recover|gain)|lungs? (heal|recover|clear)|body recover|feel better|why (should i )?quit)/.test(m)) return 'benefits';
  if (/(withdraw|symptom|how long|headache|brain fog|dizzy|fatigue|tired)/.test(m)) return 'withdrawal';
  if (/(why .*addict|dopamine|how does nicotine|receptor|hooked)/.test(m)) return 'mechanism';
  if (/(vap|e-?cig|pod|mod|nic(otine)? (salt|pouch)|zyn|taper)/.test(m)) return 'vaping';
  if (/(trigger|after meals|bored|routine|cope|cbt|habit)/.test(m)) return 'behavioral';
  return 'default';
}

/**
 * Build the full system prompt sent to the chat model.
 * - `evidence` is the retrieved RAG chunks (already filtered to non-reference-only).
 * - `contextLine` is the per-user state (streak, $ saved, triggers...).
 * - `routeFlag` set => prepend a hard routing instruction.
 */
export function buildSageSystemPrompt(opts: {
  contextLine: string;
  evidence: RetrievedEvidence[];
  contacts: RoutingContacts;
  routeFlag?: RouteFlag;
}): string {
  const { contextLine, evidence, contacts, routeFlag } = opts;
  const sections: string[] = [SAGE_PERSONA];

  if (routeFlag === 'crisis') {
    sections.push(
      `SAFETY OVERRIDE — the user may be in crisis or describing a medical emergency. STOP coaching techniques. Respond with brief, warm concern and direct them to immediate help: ${contacts.crisis.name} — ${contacts.crisis.phone}. ${contacts.crisis.note ?? ''} Encourage them to contact a clinician or emergency services if they are in danger. Do not provide cessation tips in this reply.`,
    );
  } else if (routeFlag === 'medical') {
    sections.push(
      `MEDICAL ROUTING — the user is asking for a dosing/medication decision that needs clinical judgment. Do NOT give doses or recommend a specific medication. Explain only at a high level that options exist, and route them to a clinician or pharmacist, or the quitline: ${contacts.quitline.name} — ${contacts.quitline.phone}.`,
    );
  }

  sections.push(CORE_KNOWLEDGE);
  if (evidence.length) {
    const lines = evidence
      .map((e) => `- [${e.topic} · ${e.sourceName}] ${e.text}`)
      .join('\n');
    sections.push(
      `RETRIEVED EVIDENCE (source-grounded — PRIORITIZE this over the core facts above; reference the idea, not a raw URL; if it does not cover the question, say what you do and don’t know rather than inventing):\n${lines}`,
    );
  } else {
    sections.push(
      'No source-specific evidence was retrieved for this message — rely only on the core facts above and general principles; do NOT invent timelines, statistics, or medical specifics. If the user needs detail you are unsure of, say so and offer the quitline.',
    );
  }

  sections.push(`User context: ${contextLine}`);
  sections.push(
    `Routing contacts (surface when relevant): quitline ${contacts.quitline.name} ${contacts.quitline.phone}; crisis ${contacts.crisis.name} ${contacts.crisis.phone}.`,
  );

  return sections.join('\n\n');
}
