export const meta = {
  name: 'sage-corpus-v2',
  description: 'Scale the Sage corpus: scout 20 allowlisted domains across 11 topics (incl. new mood/vaping/lifestyle/benefits), fetch + curate every page into chunks',
  phases: [
    { title: 'Scout', detail: 'one scout per allowlisted domain, biased toward the new topics' },
    { title: 'Curate', detail: 'fetch, clean, chunk, topic-tag, source-stamp each page' },
  ],
}

const RETRIEVAL_DATE = '2026-06-10'
const TOPICS = ['mechanism', 'withdrawal', 'cravings', 'behavioral', 'relapse', 'nrt', 'teen', 'mood', 'vaping', 'lifestyle', 'benefits']
const NEW_TOPIC_BRIEF =
  'mood = coping with anger/irritability/stress/anxiety/low mood while quitting; ' +
  'vaping = ADULT vaping/e-cig quitting specifics (devices, pouches, tapering, dual use); ' +
  'lifestyle = sleep problems, appetite/weight, exercise, alcohol/caffeine, social situations while quitting; ' +
  'benefits = health-recovery timeline after quitting (20 minutes to 15 years) and motivation.'

// Original 8 domains: corpus already covers their core cessation pages — scouts
// must skip those URLs and hunt the NEW topics. The 12 new domains get a full spread.
const DOMAINS = [
  { domain: 'cdc.gov', name: 'CDC', n: 4, hints: ['benefits of quitting timeline', 'stress and smoking', 'quitting and mental health', 'adult e-cigarette quitting'], exclude: ['https://www.cdc.gov/tobacco/campaign/tips/quit-smoking/tips-for-quitting/index.html', 'https://www.cdc.gov/tobacco/campaign/tips/quit-smoking/7-common-withdrawal-symptoms/index.html', 'https://www.cdc.gov/tobacco/campaign/tips/quit-smoking/quit-smoking-medications/how-quit-smoking-medicines-work/index.html', 'https://www.cdc.gov/tobacco/e-cigarettes/youth-quitting.html'] },
  { domain: 'smokefree.gov', name: 'Smokefree.gov (NCI)', n: 5, hints: ['manage stress when quitting', 'mood and smoking', 'anger irritability', 'weight gain quitting', 'trouble sleeping', 'drinking and social situations', 'benefits of quitting'], exclude: ['https://smokefree.gov/challenges-when-quitting/withdrawal', 'https://smokefree.gov/challenges-when-quitting/cravings-triggers/how-manage-cravings', 'https://smokefree.gov/quit-smoking/getting-started/prepare-to-quit'] },
  { domain: 'nida.nih.gov', name: 'NIH / NIDA', n: 3, hints: ['nicotine mental health', 'stress addiction relapse', 'e-cigarette adult cessation'], exclude: ['https://nida.nih.gov/publications/research-reports/tobacco-nicotine-e-cigarettes/nicotine-addictive', 'https://nida.nih.gov/publications/research-reports/tobacco-nicotine-e-cigarettes/what-are-treatments-tobacco-dependence', 'https://nida.nih.gov/publications/drugfacts/vaping-devices-electronic-cigarettes'] },
  { domain: 'cancer.gov', name: 'NCI cancer.gov', n: 3, hints: ['benefits of quitting smoking', 'smoking and stress anxiety depression', 'weight gain after quitting'], exclude: ['https://www.cancer.gov/about-cancer/causes-prevention/risk/tobacco/withdrawal-fact-sheet', 'https://www.cancer.gov/about-cancer/causes-prevention/risk/tobacco/quit-smoking-pdq', 'https://cancercontrol.cancer.gov/brp/tcrb/smoking-cessation'] },
  { domain: 'who.int', name: 'WHO', n: 3, hints: ['e-cigarettes fact sheet', 'quitting tobacco mental health benefits', 'tobacco and mental health'], exclude: ['https://www.who.int/news/item/02-07-2024-who-releases-first-ever-clinical-treatment-guideline-for-tobacco-cessation-in-adults', 'https://www.who.int/news-room/fact-sheets/detail/tobacco', 'https://www.who.int/news-room/questions-and-answers/item/tobacco-health-benefits-of-smoking-cessation'] },
  { domain: 'mayoclinic.org', name: 'Mayo Clinic', n: 4, hints: ['quit smoking weight gain', 'smoking cessation stress anxiety', 'quitting smoking sleep', '10 ways to resist tobacco cravings'], exclude: [] },
  { domain: 'cochranelibrary.com', name: 'Cochrane', n: 3, hints: ['exercise interventions smoking cessation', 'e-cigarettes for smoking cessation review', 'interventions weight gain cessation', 'mindfulness smoking cessation'], exclude: [] },
  { domain: 'ncbi.nlm.nih.gov', name: 'PubMed Central', n: 5, hints: ['anger irritability smoking abstinence', 'mindfulness ACT smoking cessation', 'smoking cessation anxiety depression improvement', 'sleep disturbance nicotine withdrawal', 'physical activity craving reduction', 'vaping cessation interventions adults'], exclude: ['https://www.ncbi.nlm.nih.gov/books/NBK555596/', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4636196/', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4542051/', 'https://www.ncbi.nlm.nih.gov/books/NBK493148/', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7874528/', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7163392/', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10984029/'] },
  { domain: 'truthinitiative.org', name: 'Truth Initiative', n: 5, hints: ['quitting vaping guide', 'nicotine and mental health anxiety depression', 'how to quit JUUL e-cigarettes', 'nicotine withdrawal vaping', 'quitting and stress'], exclude: [] },
  { domain: 'cancer.org', name: 'American Cancer Society', n: 5, hints: ['benefits of quitting smoking over time', 'dealing with cravings', 'quitting e-cigarettes', 'help for cravings and tough situations', 'staying tobacco-free after quitting'], exclude: [] },
  { domain: 'lung.org', name: 'American Lung Association', n: 5, hints: ['quit smoking benefits timeline', 'managing stress quit smoking', 'vaping quit guide', 'slip vs relapse', 'top tips to quit'], exclude: [] },
  { domain: 'heart.org', name: 'American Heart Association', n: 3, hints: ['quit smoking benefits heart', 'dealing with urges to smoke', 'quit vaping'], exclude: [] },
  { domain: 'nhs.uk', name: 'NHS', n: 5, hints: ['quit smoking better health', 'stop smoking coping with cravings', 'vaping to quit smoking', 'stopping smoking mental health', 'quit smoking timeline what happens'], exclude: [] },
  { domain: 'samhsa.gov', name: 'SAMHSA', n: 3, hints: ['smoking cessation behavioral health', 'tobacco use mental health conditions', 'quitting smoking anxiety depression'], exclude: [] },
  { domain: 'medlineplus.gov', name: 'MedlinePlus (NLM)', n: 5, hints: ['nicotine withdrawal', 'quitting smoking weight', 'managing cravings after quitting', 'benefits of quitting tobacco', 'e-cigarettes'], exclude: [] },
  { domain: 'fda.gov', name: 'FDA', n: 3, hints: ['quitting smoking resources', 'nicotine is why tobacco products are addictive', 'vaping e-cigarette facts'], exclude: [] },
  { domain: 'clevelandclinic.org', name: 'Cleveland Clinic', n: 4, hints: ['nicotine withdrawal symptoms timeline', 'how to quit vaping', 'quitting smoking what happens to your body', 'smoking and anxiety'], exclude: [] },
  { domain: 'hopkinsmedicine.org', name: 'Johns Hopkins Medicine', n: 4, hints: ['quit smoking strategies', 'vaping quit guide', 'nicotine addiction why so hard to quit', 'benefits of quitting'], exclude: [] },
  { domain: 'health.harvard.edu', name: 'Harvard Health', n: 4, hints: ['quitting smoking mood depression', 'how to handle nicotine cravings', 'quit vaping', 'exercise and quitting smoking'], exclude: [] },
  { domain: 'healthychildren.org', name: 'AAP HealthyChildren', n: 3, hints: ['teen vaping how to help quit', 'talking to teens about vaping nicotine', 'nicotine addiction youth'], exclude: [] },
]

const URL_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    urls: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          url: { type: 'string' },
          topic: { type: 'string', enum: TOPICS },
          why: { type: 'string' },
        },
        required: ['url', 'topic'],
      },
    },
  },
  required: ['urls'],
}

const CURATE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    ok: { type: 'boolean' },
    onAllowlistedDomain: { type: 'boolean' },
    topic: { type: 'string', enum: TOPICS },
    referenceOnly: { type: 'boolean' },
    chunks: { type: 'array', items: { type: 'string' } },
  },
  required: ['ok', 'onAllowlistedDomain', 'topic', 'referenceOnly', 'chunks'],
}

const results = await pipeline(
  DOMAINS,
  (d) => agent(
    `You are ScoutAgent. Find ${d.n}-${d.n + 1} canonical, currently-live nicotine/tobacco CESSATION pages on the domain ${d.domain} (${d.name}). ` +
    `Topic tags available: ${TOPICS.join(', ')}. New topics we especially need coverage for: ${NEW_TOPIC_BRIEF} ` +
    `Also fine: addiction mechanism, withdrawal timeline, craving management, behavioral techniques (CBT, urge surfing, HALT, trigger planning), relapse prevention, NRT overview, teen vaping. ` +
    `Use web search and fetch to CONFIRM each URL resolves and its final host is on ${d.domain}. Hints: ${d.hints.join('; ')}. ` +
    (d.exclude.length ? `ALREADY IN CORPUS — do NOT return these URLs: ${d.exclude.join(' ; ')}. ` : '') +
    `Return ONLY real https URLs on ${d.domain}. No PDFs, no press releases, no index/hub pages with no substance. Pick the single best-matching topic tag for each.`,
    { label: `scout:${d.domain}`, phase: 'Scout', schema: URL_SCHEMA, agentType: 'Explore' },
  ).then((r) => {
    const seen = new Set(d.exclude)
    return (r?.urls || []).filter((u) => {
      if (!u.url || seen.has(u.url)) return false
      seen.add(u.url)
      return true
    }).map((u) => ({ ...u, domain: d.domain, name: d.name }))
  }),
  (urls, d) => {
    log(`${d.domain}: ${urls.length} pages scouted, curating`)
    return parallel(urls.map((u) => () =>
      agent(
        `You are Fetch+CuratorAgent. Fetch ${u.url} and process it for a nicotine-cessation knowledge base.\n` +
        `1. If the fetch fails, set ok:false. If the final page is NOT hosted on the allowlisted domain ${u.domain}, set onAllowlistedDomain:false and ok:false.\n` +
        `2. Strip all nav, boilerplate, ads, and marketing fluff. Keep only substantive, factual cessation content.\n` +
        `3. Split that content into 4-12 self-contained chunks. Each chunk = 2-6 sentences that stand alone. No header-only chunks; fold context in. Preserve concrete specifics: timelines, numbers, named techniques.\n` +
        `4. Tag the page primary topic (one of: ${TOPICS.join(', ')}). ${NEW_TOPIC_BRIEF}\n` +
        `5. Set referenceOnly:true if the page contains specific drug DOSING, mg amounts, titration schedules, or medication instructions requiring clinical judgment, so Sage stores it as reference but never repeats it verbatim. Otherwise false.\n` +
        `Return clean plain-text chunks only (no markdown headers).`,
        { label: `curate:${u.domain}`, phase: 'Curate', schema: CURATE_SCHEMA },
      ).then((r) => (r && r.ok && r.onAllowlistedDomain && Array.isArray(r.chunks) && r.chunks.length)
        ? { sourceUrl: u.url, sourceName: u.name, domain: u.domain, topic: r.topic, referenceOnly: !!r.referenceOnly, retrievalDate: RETRIEVAL_DATE, chunks: r.chunks }
        : null)
    ))
  },
)

const entries = results.filter(Boolean).flat().filter(Boolean)
const totalChunks = entries.reduce((n, e) => n + e.chunks.length, 0)
log(`Curated ${entries.length} new sources / ${totalChunks} chunks`)
return { retrievalDate: RETRIEVAL_DATE, sourceCount: entries.length, chunkCount: totalChunks, entries }
