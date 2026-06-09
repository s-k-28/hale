# Sage Cessation Knowledge Engine

RAG layer that makes **Sage** an evidence-grounded nicotine-cessation coach.
Knowledge comes ONLY from a curated allowlist of authoritative sources; it is
embedded into the Convex RAG component and retrieved per message, then injected
into Sage's system prompt before the LLM call.

## Hard rules (enforced in code)
- **Allowlist only.** No open web, forums, blogs, or SEO. Enforced four times:
  Scout (on-domain search), Fetch/Curate (final-URL re-check), build-corpus
  (`scripts/build-corpus.mjs`), and ingest (`convex/rag.ts` → `isAllowlisted`).
- **Minor-safe.** Sage never prescribes NRT doses/medication. Dosing/clinical
  pages are tagged `referenceOnly` and filtered OUT of what Sage can repeat
  (`filters: [{ referenceOnly: false }]`); medication-decision messages route to
  a clinician/quitline (`detectRouteFlag` → `medical`).
- **Every chunk is sourced.** Source URL + retrieval date live in entry metadata.
  No source = not ingested.

## File map
| File | Role |
|---|---|
| `knowledge/sources.config.ts` | **Edit me.** Allowlist, topics→namespaces, importance, embedding model, quitline + crisis contacts. |
| `knowledge/corpus.ts` | Generated curated corpus (the only thing ingested). |
| `knowledge/agents/{1..5}-*.md` | Scout / Fetch / Curator / Ingest / Eval agent contracts. |
| `knowledge/agents/corpus.workflow.js` | Scout→Fetch→Curate orchestrator (the agent team). |
| `knowledge/eval/questions.ts` | 25 EvalAgent questions. |
| `scripts/build-corpus.mjs` | Workflow output → `corpus.ts` (re-validates allowlist). |
| `convex/convex.config.ts` | Registers `@convex-dev/rag`. |
| `convex/rag.ts` | RAG client + `ingestAll` pipeline. |
| `convex/sageKnowledge.ts` | `searchKnowledge` (retrieval) + `runEval`. |
| `convex/model/sage.prompt.ts` | MI persona, evidence-grounding, crisis/medical routing. |

## One-time setup
Embeddings use Google `text-embedding-004` (free tier). Get a key at
<https://aistudio.google.com> → "Get API key", then set it on the deployment:

```bash
npx convex env set GOOGLE_GENERATIVE_AI_API_KEY <your-key>
```

(The chat model is separate — Groq, set as `GROQ_API_KEY`.)

## Re-running ingestion (when you add a source)
1. **Add the source** in `knowledge/sources.config.ts`:
   - add the domain to `ALLOWLISTED_DOMAINS` and give it a `DOMAIN_IMPORTANCE`.
2. **Re-gather the corpus** with the agent team. In Claude Code, re-run the
   Scout→Fetch→Curate workflow (`knowledge/agents/corpus.workflow.js`) — edit the
   `DOMAINS` array in it if you added a domain. It returns a result JSON.
3. **Build the corpus file:**
   ```bash
   node scripts/build-corpus.mjs <path-to-workflow-result.json>
   ```
   This regenerates `knowledge/corpus.ts` (re-validating the allowlist + topics).
4. **Deploy + ingest** (idempotent — only changed sources are rewritten):
   ```bash
   npx convex run rag:ingestAll
   ```
5. **Evaluate retrieval:**
   ```bash
   npx convex run sageKnowledge:runEval
   ```
   Pass bar: `failedEmpty === 0`. Inspect `npx convex logs` for per-question hits.

> Adding a single hand-picked source without the full workflow? Append a
> `CorpusEntry` to `knowledge/corpus.ts` (must include `sourceUrl`,
> `retrievalDate`, a valid `topic`, and an allowlisted host), then run steps 4–5.

## How retrieval works at runtime
`convex/sage.ts` → on each user message: `routeKey()` picks topic namespaces →
`searchKnowledge()` vector-searches them (excluding `referenceOnly`) →
`buildSageSystemPrompt()` injects the evidence + sources + core facts →
Groq generates. Retrieval failures degrade gracefully to Sage's baked-in core
knowledge (chat never breaks). Retrieved sources are logged for debugging:
`npx convex logs` → `[sage:rag] "<msg>" → N chunks from <sources>`.
