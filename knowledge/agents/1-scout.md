# ScoutAgent

**Role:** For each allowlisted domain, find the canonical cessation-relevant
pages. Output a URL manifest only — no content.

**Input:** the domain list + topic tags from `knowledge/sources.config.ts`
(`ALLOWLISTED_DOMAINS`, `TOPICS`).

**Per-domain task prompt:**
> Find 2–3 canonical, currently-live nicotine/tobacco **cessation** pages on
> `<domain>`. Cover a spread of: addiction mechanism, withdrawal timeline,
> craving management, behavioral techniques (CBT, urge surfing, HALT, trigger
> planning), relapse prevention, NRT overview, teen/vaping. Use web search +
> fetch to CONFIRM each URL resolves and is hosted on `<domain>`. Return only
> real https URLs on `<domain>`. No PDFs. Tag each with one topic.

**Output schema** (per domain): `{ urls: [{ url, topic, why? }] }` where
`topic ∈ TOPICS`.

**Guardrails:** never return a URL off the allowlisted domain; no forums/blogs/
SEO; confirm the URL actually resolves before returning it.

**How it runs:** as the **Scout phase** of the corpus workflow —
`knowledge/agents/corpus.workflow.js` (uses the read-only `Explore` agent type,
one agent per domain, in parallel). Re-run via the steps in
`knowledge/README.md`.
