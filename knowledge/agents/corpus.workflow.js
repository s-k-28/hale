export const meta = {
  name: 'sage-corpus-gather',
  description: 'Scout, fetch, and curate nicotine-cessation knowledge from an allowlist of authoritative sources for the Sage RAG index',
  phases: [
    { title: 'Scout', detail: 'find canonical cessation pages per allowlisted domain' },
    { title: 'Curate', detail: 'fetch, clean, chunk, topic-tag, source-stamp each page' },
  ],
}

const RETRIEVAL_DATE = '2026-06-09'
const TOPICS = ['mechanism', 'withdrawal', 'cravings', 'behavioral', 'relapse', 'nrt', 'teen']
const DOMAINS = [
  { domain: 'cdc.gov', name: 'CDC', hints: ['smoking cessation', 'nicotine withdrawal', 'how to quit', 'youth e-cigarette vaping'] },
  { domain: 'smokefree.gov', name: 'Smokefree.gov (NCI)', hints: ['what to expect when you quit', 'withdrawal', 'managing cravings', 'teen.smokefree.gov'] },
  { domain: 'nida.nih.gov', name: 'NIH / NIDA', hints: ['nicotine addiction mechanism', 'tobacco nicotine vaping', 'how addiction works'] },
  { domain: 'cancer.gov', name: 'NCI cancer.gov', hints: ['nicotine withdrawal fact sheet', 'quitting tobacco'] },
  { domain: 'who.int', name: 'WHO', hints: ['tobacco quitting', 'tobacco fact sheet'] },
  { domain: 'mayoclinic.org', name: 'Mayo Clinic', hints: ['nicotine withdrawal symptoms', 'quit smoking strategies', 'nicotine dependence'] },
  { domain: 'cochranelibrary.com', name: 'Cochrane', hints: ['nicotine replacement therapy review', 'behavioural support cessation'] },
  { domain: 'ncbi.nlm.nih.gov', name: 'PubMed Central', hints: ['urge surfing cessation', 'CBT smoking cessation', 'relapse prevention nicotine'] },
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

phase('Scout')
const scouted = await parallel(DOMAINS.map((d) => () =>
  agent(
    `You are ScoutAgent. Find 2-3 canonical, currently-live nicotine/tobacco CESSATION pages on the domain ${d.domain} (${d.name}). ` +
    `Cover a spread of: addiction mechanism, withdrawal timeline, craving management, behavioral techniques (CBT, urge surfing, HALT, trigger planning), relapse prevention, NRT overview, and teen/vaping specifics. ` +
    `Use web search and fetch to CONFIRM each URL resolves and is hosted on ${d.domain}. Hints: ${d.hints.join('; ')}. ` +
    `Return ONLY real https URLs on ${d.domain}. No PDFs. Pick the single best-matching topic tag for each.`,
    { label: `scout:${d.domain}`, phase: 'Scout', schema: URL_SCHEMA, agentType: 'Explore' },
  ).then((r) => (r?.urls || []).map((u) => ({ ...u, domain: d.domain, name: d.name })))
)).then((a) => a.filter(Boolean).flat())

const seen = new Set()
const urls = scouted.filter((u) => {
  if (!u.url || seen.has(u.url)) return false
  seen.add(u.url)
  return true
})
log(`Scouted ${urls.length} unique URLs across ${DOMAINS.length} allowlisted domains`)

phase('Curate')
const curated = await parallel(urls.map((u) => () =>
  agent(
    `You are Fetch+CuratorAgent. Fetch ${u.url} and process it for a nicotine-cessation knowledge base.\n` +
    `1. If the fetch fails, set ok:false. If the final page is NOT hosted on the allowlisted domain ${u.domain}, set onAllowlistedDomain:false and ok:false.\n` +
    `2. Strip all nav, boilerplate, ads, and marketing fluff. Keep only substantive, factual cessation content.\n` +
    `3. Split that content into 4-12 self-contained chunks. Each chunk = 2-6 sentences that stand alone. No header-only chunks; fold context in.\n` +
    `4. Tag the page primary topic (one of: ${TOPICS.join(', ')}).\n` +
    `5. Set referenceOnly:true if the page contains specific drug DOSING, mg amounts, titration schedules, or medication instructions requiring clinical judgment, so Sage stores it as reference but never repeats it verbatim. Otherwise false.\n` +
    `Return clean plain-text chunks only (no markdown headers).`,
    { label: `curate:${u.domain}`, phase: 'Curate', schema: CURATE_SCHEMA },
  ).then((r) => (r && r.ok && r.onAllowlistedDomain && Array.isArray(r.chunks) && r.chunks.length)
    ? { sourceUrl: u.url, sourceName: u.name, domain: u.domain, topic: r.topic, referenceOnly: !!r.referenceOnly, retrievalDate: RETRIEVAL_DATE, chunks: r.chunks }
    : null)
)).then((a) => a.filter(Boolean))

const totalChunks = curated.reduce((n, e) => n + e.chunks.length, 0)
log(`Curated ${curated.length} sources / ${totalChunks} chunks`)
return { retrievalDate: RETRIEVAL_DATE, sourceCount: curated.length, chunkCount: totalChunks, entries: curated }