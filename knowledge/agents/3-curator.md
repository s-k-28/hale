# CuratorAgent

**Role:** Dedupe, drop marketing fluff, chunk, tag each doc by topic, and FLAG
anything that looks like dosing/medical instruction as reference-only.

**Task (per fetched page):**
> 1. Split the cleaned content into 4–12 **self-contained** chunks (2–6
>    sentences each, readable in isolation; no header-only chunks).
> 2. Tag the page's primary `topic ∈ {mechanism, withdrawal, cravings,
>    behavioral, relapse, nrt, teen}`.
> 3. Set `referenceOnly:true` if the page contains specific drug **dosing**, mg
>    amounts, titration schedules, or medication instructions requiring clinical
>    judgment — so it is stored for reference but **never repeated verbatim** by
>    Sage. Otherwise `false`.

**Output schema:**
`{ ok, onAllowlistedDomain, topic, referenceOnly, chunks: string[] }`

**Dedup:** by source URL (one entry per source); `scripts/build-corpus.mjs`
drops duplicate URLs and rejects off-allowlist/empty/untagged entries.

**Why referenceOnly matters:** at retrieval time `convex/sageKnowledge.ts`
searches with `filters: [{ name:'referenceOnly', value:false }]`, so dosing
chunks are indexed (debuggable, auditable) but can never surface as advice Sage
repeats — the key guardrail for minors.

**How it runs:** Curate phase of `knowledge/agents/corpus.workflow.js`.
