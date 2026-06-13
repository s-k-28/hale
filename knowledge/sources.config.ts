/**
 * Sage Cessation Knowledge Engine — single source of truth for what may enter
 * the knowledge base and how it is organized.
 *
 * EDIT THIS FILE to add/remove sources, retune importance, or change the
 * routing contacts. After editing, re-run ingestion (see knowledge/README.md).
 *
 * Pure config — no Convex/RN imports — so both the Convex backend and the
 * standalone subagent scripts can import it.
 */

/* ----------------------------- Allowlist --------------------------------- */
// Knowledge may ONLY be ingested from these authoritative domains. A page whose
// FINAL host (after redirects) is not one of these is rejected — no open web,
// no forums, no blogs, no SEO content. Subdomains are allowed (endsWith match).
export const ALLOWLISTED_DOMAINS = [
  'cdc.gov',
  'smokefree.gov',
  'nida.nih.gov',
  'cancer.gov',
  'who.int',
  'mayoclinic.org',
  'cochranelibrary.com',
  'ncbi.nlm.nih.gov', // PubMed / PubMed Central abstracts
  'truthinitiative.org', // research-driven nonprofit; strongest vaping/teen content
  'cancer.org', // American Cancer Society
  'lung.org', // American Lung Association
  'heart.org', // American Heart Association
  'nhs.uk', // UK National Health Service
  'samhsa.gov', // substance-use + mental-health agency
  'medlineplus.gov', // NLM plain-language medical encyclopedia
  'fda.gov', // tobacco products / vaping regulation + facts
  'clevelandclinic.org',
  'hopkinsmedicine.org',
  'health.harvard.edu',
  'healthychildren.org', // American Academy of Pediatrics
] as const;

export type AllowlistedDomain = (typeof ALLOWLISTED_DOMAINS)[number];

/** True if `url`'s host is (or is a subdomain of) an allowlisted domain. */
export function isAllowlisted(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return ALLOWLISTED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

/* ------------------------------- Topics ---------------------------------- */
// Each topic is its own RAG namespace, so retrieval can target the right slice
// (e.g. a craving question searches `cravings` + `behavioral`).
export const TOPICS = [
  'mechanism', // how nicotine addiction works
  'withdrawal', // symptoms + timeline
  'cravings', // craving management / urge surfing
  'behavioral', // CBT, HALT, trigger planning, coping skills
  'relapse', // relapse prevention + recovery from a slip
  'nrt', // nicotine-replacement / medication OVERVIEW (high level only)
  'teen', // teen vaping specifics
  'mood', // anger, stress, anxiety, low-mood coping while quitting
  'vaping', // adult vaping / e-cig quitting specifics (devices, tapering, dual use)
  'lifestyle', // sleep, appetite/weight, exercise, alcohol/caffeine, social situations
  'benefits', // health-recovery timeline + motivation (what improves and when)
] as const;

export type Topic = (typeof TOPICS)[number];

// Which namespaces to search for a given user intent. Keep small + overlapping.
export const TOPIC_ROUTES: Record<string, Topic[]> = {
  craving: ['cravings', 'behavioral', 'withdrawal'],
  withdrawal: ['withdrawal', 'mood', 'cravings'],
  relapse: ['relapse', 'behavioral', 'mood'],
  behavioral: ['behavioral', 'cravings', 'relapse'],
  mechanism: ['mechanism', 'withdrawal'],
  nrt: ['nrt', 'mechanism', 'vaping'],
  teen: ['teen', 'vaping', 'mechanism'],
  mood: ['mood', 'withdrawal', 'behavioral'],
  vaping: ['vaping', 'nrt', 'cravings'],
  lifestyle: ['lifestyle', 'withdrawal', 'behavioral'],
  benefits: ['benefits', 'mechanism', 'withdrawal'],
  default: ['withdrawal', 'cravings', 'behavioral'],
};

/* --------------------------- Importance ---------------------------------- */
// 0..1 weight applied to every chunk from a domain (peer-reviewed / CDC / NIH
// rank higher). Used as `importance` on rag.add() to bias retrieval ranking.
export const DOMAIN_IMPORTANCE: Record<AllowlistedDomain, number> = {
  'cochranelibrary.com': 1.0, // systematic reviews — strongest evidence
  'ncbi.nlm.nih.gov': 0.95, // peer-reviewed (PubMed/PMC)
  'nida.nih.gov': 0.9,
  'cdc.gov': 0.9,
  'cancer.gov': 0.9,
  'who.int': 0.85,
  'smokefree.gov': 0.8,
  'mayoclinic.org': 0.75,
  'truthinitiative.org': 0.85,
  'cancer.org': 0.85,
  'lung.org': 0.8,
  'heart.org': 0.8,
  'nhs.uk': 0.85,
  'samhsa.gov': 0.85,
  'medlineplus.gov': 0.85,
  'fda.gov': 0.85,
  'clevelandclinic.org': 0.75,
  'hopkinsmedicine.org': 0.8,
  'health.harvard.edu': 0.75,
  'healthychildren.org': 0.8,
};

export function importanceFor(url: string): number {
  const match = ALLOWLISTED_DOMAINS.find((d) => {
    try {
      const h = new URL(url).hostname.toLowerCase();
      return h === d || h.endsWith(`.${d}`);
    } catch {
      return false;
    }
  });
  return match ? DOMAIN_IMPORTANCE[match] : 0.5;
}

/* --------------------------- Embeddings ---------------------------------- */
// Google gemini-embedding-001 (free tier, 3072-dim native). Reads
// GOOGLE_GENERATIVE_AI_API_KEY from the Convex deployment env. Dimension MUST
// match what the model returns (3072 here; < Convex's 4096 vector-index limit).
export const EMBEDDING = {
  provider: 'google' as const,
  model: 'gemini-embedding-001',
  dimension: 3072,
  apiKeyEnvVar: 'GOOGLE_GENERATIVE_AI_API_KEY',
};

/* --------------------- Routing contacts (configurable) -------------------- */
// NOT hardcoded into the prompt — Sage surfaces these from here. Edit for your
// region / regulatory needs.
export const CONTACTS = {
  quitline: {
    name: 'NCI Smoking Quitline',
    phone: '1-877-44U-QUIT (1-877-448-7848)',
    url: 'https://smokefree.gov',
    note: 'Free coaching, materials, and referrals (US).',
  },
  crisis: {
    name: '988 Suicide & Crisis Lifeline',
    phone: '988',
    url: 'https://988lifeline.org',
    note: 'US — call or text 988, 24/7. If someone is in immediate danger, call 911.',
  },
} as const;
