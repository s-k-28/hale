# FetchAgent

**Role:** Fetch each scouted URL, strip nav/boilerplate, keep clean text +
source metadata. Skip anything that fails the allowlist check.

**Input:** the deduped URL manifest from ScoutAgent.

**Task (per URL):**
> Fetch `<url>`. If the fetch fails → `ok:false`. If the FINAL host (after
> redirects) is not the allowlisted domain → `onAllowlistedDomain:false, ok:false`.
> Otherwise strip nav, ads, boilerplate, and marketing; keep only substantive,
> factual cessation content as clean plain text.

**Guardrails (hard rule):** the allowlist is re-checked on the *final* URL, not
the scouted one — redirects off-domain are rejected. Every kept page must carry
its `sourceUrl` + `retrievalDate`.

**How it runs:** fused with CuratorAgent in the **Curate phase** of
`knowledge/agents/corpus.workflow.js` (fetch + clean + chunk in one agent so the
cleaned text never has to round-trip). The allowlist gate is also enforced a
third time at corpus-build (`scripts/build-corpus.mjs`) and a fourth at ingest
(`convex/rag.ts` → `isAllowlisted`).
